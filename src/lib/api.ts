import { NextResponse } from "next/server";
import { GameError } from "./okey/game";
import { NotFound } from "./store";

export function cleanName(name: unknown): string {
  const n = typeof name === "string" ? name.trim().slice(0, 16) : "";
  return n || "Oyuncu";
}

export function newToken(): string {
  return crypto.randomUUID();
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof NotFound) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

const buckets = new Map<string, number[]>();

/**
 * Basit, sunucu örneği başına istek sınırı (en iyi çaba). Pencere içinde `max`
 * istekten fazlası GameError ile reddedilir.
 */
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) throw new GameError("Çok hızlı, biraz bekleyin");
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear();
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}
