"use client";

import type { PlayerView } from "./okey/view";

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // gizli sekme vb.
  }
}

export const tokenKey = (code: string) => `okey:token:${code}`;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Bağlantı hatası", res.status);
  return data as T;
}

export function createRoom(name: string) {
  return request<{ code: string; token: string }>("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function fetchView(code: string, token: string) {
  return request<PlayerView>(`/api/rooms/${code}?token=${encodeURIComponent(token)}`);
}

export type Action =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "newHand" }
  | { type: "newMatch" }
  | { type: "draw"; from: "deck" | "discard" }
  | { type: "discard"; tile: number }
  | { type: "finish"; tile: number };

export function sendAction(code: string, token: string, action: Action) {
  return request<{ token: string; view: PlayerView }>(`/api/rooms/${code}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...action, token }),
  });
}
