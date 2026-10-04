import { Redis } from "@upstash/redis";
import { normalize, type GameState } from "./okey/game";

// Oda durumu Supabase (Postgres) ya da Upstash Redis'te tutulur. Ortam
// değişkenleri yoksa (yerel geliştirme) bellek içi depo kullanılır.

const TTL_SECONDS = 6 * 60 * 60;
const LOCK_MS = 4000;

interface Store {
  get(code: string): Promise<GameState | null>;
  set(state: GameState): Promise<void>;
  /** Oda yoksa oluşturur; kod doluysa false döner. */
  create(state: GameState): Promise<boolean>;
  lock(code: string): Promise<boolean>;
  unlock(code: string): Promise<void>;
}

function redisStore(redis: Redis): Store {
  return {
    get: (code) => redis.get<GameState>(`room:${code}`),
    set: async (state) => {
      await redis.set(`room:${state.code}`, state, { ex: TTL_SECONDS });
    },
    create: async (state) =>
      (await redis.set(`room:${state.code}`, state, { ex: TTL_SECONDS, nx: true })) === "OK",
    lock: async (code) => (await redis.set(`lock:${code}`, 1, { nx: true, px: LOCK_MS })) === "OK",
    unlock: async (code) => {
      await redis.del(`lock:${code}`);
    },
  };
}

/** supabase/okey.sql içindeki okey_* fonksiyonlarını REST üzerinden çağırır. */
function supabaseStore(url: string, key: string, secret: string): Store {
  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_secret: secret, ...args }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Supabase ${fn}: ${res.status} ${await res.text()}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }
  return {
    get: (code) => rpc<GameState | null>("okey_get", { p_code: code }),
    set: (state) => rpc("okey_set", { p_code: state.code, p_state: state, p_ttl_seconds: TTL_SECONDS }),
    create: (state) => rpc<boolean>("okey_create", { p_code: state.code, p_state: state, p_ttl_seconds: TTL_SECONDS }),
    lock: (code) => rpc<boolean>("okey_lock", { p_code: code, p_ms: LOCK_MS }),
    unlock: (code) => rpc("okey_unlock", { p_code: code }),
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
    create: async (state) => {
      if (rooms.has(state.code)) return false;
      rooms.set(state.code, JSON.stringify(state));
      return true;
    },
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
  const { SUPABASE_URL, SUPABASE_KEY, OKEY_DB_SECRET } = process.env;
  if (SUPABASE_URL && SUPABASE_KEY && OKEY_DB_SECRET) return supabaseStore(SUPABASE_URL, SUPABASE_KEY, OKEY_DB_SECRET);
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return redisStore(new Redis({ url, token }));
  if (process.env.VERCEL) console.warn("Veritabanı ortam değişkenleri bulunamadı, bellek içi depo kullanılıyor");
  return memoryStore();
}

export const store = createStore();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lockedUpdate<T>(code: string, fn: (state: GameState) => T): Promise<T> {
  try {
    const raw = await store.get(code);
    if (!raw) throw new NotFound();
    const state = normalize(raw);
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

/**
 * Polling için: önce kilitsiz okur. Yalnızca durumun değişmesi gerekiyorsa
 * (bot hamlesi, süre aşımı, "son görülme") kilit alır; kilit doluysa beklemeden okur.
 */
export async function pollRoom<T>(
  code: string,
  needsWrite: (state: GameState) => boolean,
  fn: (state: GameState) => T,
): Promise<T> {
  const raw = await store.get(code);
  if (!raw) throw new NotFound();
  const state = normalize(raw);
  if (!needsWrite(state)) return fn(state);
  if (await store.lock(code)) return lockedUpdate(code, fn);
  return fn(state);
}

export class NotFound extends Error {
  constructor() {
    super("Oda bulunamadı");
  }
}
