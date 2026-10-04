import { Redis } from "@upstash/redis";
import type { GameState } from "./okey/game";

// Oda durumu Upstash Redis'te tutulur. Ortam değişkenleri yoksa (yerel geliştirme)
// bellek içi depo kullanılır.

const TTL_SECONDS = 6 * 60 * 60;
const LOCK_MS = 4000;

interface Store {
  get(code: string): Promise<GameState | null>;
  set(state: GameState): Promise<void>;
  exists(code: string): Promise<boolean>;
  lock(code: string): Promise<boolean>;
  unlock(code: string): Promise<void>;
}

function redisStore(redis: Redis): Store {
  return {
    get: (code) => redis.get<GameState>(`room:${code}`),
    set: async (state) => {
      await redis.set(`room:${state.code}`, state, { ex: TTL_SECONDS });
    },
    exists: async (code) => (await redis.exists(`room:${code}`)) > 0,
    lock: async (code) => (await redis.set(`lock:${code}`, 1, { nx: true, px: LOCK_MS })) === "OK",
    unlock: async (code) => {
      await redis.del(`lock:${code}`);
    },
  };
}

function memoryStore(): Store {
  const g = globalThis as unknown as { __okeyRooms?: Map<string, string>; __okeyLocks?: Map<string, number> };
  const rooms = (g.__okeyRooms ??= new Map());
  const locks = (g.__okeyLocks ??= new Map());
  return {
    get: async (code) => {
      const raw = rooms.get(code);
      return raw ? (JSON.parse(raw) as GameState) : null;
    },
    set: async (state) => {
      rooms.set(state.code, JSON.stringify(state));
    },
    exists: async (code) => rooms.has(code),
    lock: async (code) => {
      const until = locks.get(code) ?? 0;
      if (until > Date.now()) return false;
      locks.set(code, Date.now() + LOCK_MS);
      return true;
    },
    unlock: async (code) => {
      locks.delete(code);
    },
  };
}

function createStore(): Store {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return redisStore(new Redis({ url, token }));
  if (process.env.VERCEL) console.warn("Redis ortam değişkenleri bulunamadı, bellek içi depo kullanılıyor");
  return memoryStore();
}

export const store = createStore();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lockedUpdate<T>(code: string, fn: (state: GameState) => T): Promise<T> {
  try {
    const state = await store.get(code);
    if (!state) throw new NotFound();
    const before = JSON.stringify(state);
    const result = fn(state);
    if (JSON.stringify(state) !== before) {
      state.version++;
      await store.set(state);
    }
    return result;
  } finally {
    await store.unlock(code);
  }
}

/** Odayı kilitleyip değiştirir; durum değiştiyse kaydeder. */
export async function withRoom<T>(code: string, fn: (state: GameState) => T): Promise<T> {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await store.lock(code)) return lockedUpdate(code, fn);
    await sleep(80);
  }
  throw new Error("Oda meşgul, tekrar deneyin");
}

/** Polling için: kilit alınamazsa beklemeden, kaydetmeden okur. */
export async function tryWithRoom<T>(code: string, fn: (state: GameState) => T): Promise<T> {
  if (await store.lock(code)) return lockedUpdate(code, fn);
  const state = await store.get(code);
  if (!state) throw new NotFound();
  return fn(state);
}

export class NotFound extends Error {
  constructor() {
    super("Oda bulunamadı");
  }
}
