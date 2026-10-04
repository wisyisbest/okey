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
