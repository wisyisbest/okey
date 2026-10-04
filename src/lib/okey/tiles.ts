// Taşlar 0..105 arası sayılarla temsil edilir.
// 0..103: iki takım × 4 renk × 1..13, 104 ve 105: sahte okey.

export const TILE_COUNT = 106;
export const FAKE_COLOR = 4;
export const COLOR_NAMES = ["Kırmızı", "Siyah", "Mavi", "Sarı"] as const;

export interface Face {
  color: number; // 0..3, sahte okey için 4
  num: number; // 1..13, sahte okey için 0
}

export function face(id: number): Face {
  if (id >= 104) return { color: FAKE_COLOR, num: 0 };
  const t = id % 52;
  return { color: Math.floor(t / 13), num: (t % 13) + 1 };
}

export function isFake(id: number): boolean {
  return id >= 104;
}

/** Gösterge taşından okeyi bulur: aynı renk, bir üst sayı (13'ten sonra 1). */
export function okeyOf(indicator: number): Face {
  const f = face(indicator);
  return { color: f.color, num: (f.num % 13) + 1 };
}

export function isJoker(id: number, okey: Face): boolean {
  const f = face(id);
  return f.color === okey.color && f.num === okey.num;
}

/** Taşın oyundaki değeri: okey ise null (joker), sahte okey ise okeyin değeri. */
export function effective(id: number, okey: Face): Face | null {
  if (isJoker(id, okey)) return null;
  if (isFake(id)) return okey;
  return face(id);
}

/** 52 elemanlı sayaç dizisindeki indeks. */
export function faceIndex(f: Face): number {
  return f.color * 13 + (f.num - 1);
}

export function shuffledDeck(rng: () => number = Math.random): number[] {
  const deck = Array.from({ length: TILE_COUNT }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
