// Istaka düzeni: 2 sıra × 13 yuva. Yalnızca istemcide tutulur.

export const ROW = 13;
export const SLOTS = ROW * 2;

export type Slots = (number | null)[];

export function emptySlots(): Slots {
  return new Array(SLOTS).fill(null);
}

/** Grupları aralarında birer boşlukla sıralara yerleştirir. */
export function layoutGroups(groups: number[][]): Slots {
  const slots = emptySlots();
  let row = 0;
  let col = 0;
  for (const g of groups) {
    if (!g.length) continue;
    if (col + g.length > ROW) {
      row++;
      col = 0;
    }
    if (row > 1 || g.length > ROW) return compact(groups.flat());
    g.forEach((t, k) => (slots[row * ROW + col + k] = t));
    col += g.length + 1;
  }
  return slots;
}

function compact(tiles: number[]): Slots {
  const slots = emptySlots();
  tiles.forEach((t, k) => (slots[k] = t));
  return slots;
}

/** Sunucudaki el ile düzeni eşitler: giden taşları siler, yenileri boş yuvaya koyar. */
export function syncSlots(slots: Slots, hand: number[]): Slots {
  const set = new Set(hand);
  const out = slots.map((t) => (t !== null && set.has(t) ? t : null));
  const placed = new Set(out.filter((t): t is number => t !== null));
  for (const t of hand) {
    if (placed.has(t)) continue;
    // Önce ilk sıranın sonundaki boşluk, sonra herhangi bir boşluk
    let k = -1;
    for (let i = ROW - 1; i >= 0 && out[i] === null; i--) k = i;
    if (k < 0) k = out.indexOf(null);
    out[k] = t;
  }
  return out;
}

/** Taşı hedef yuvaya taşır; doluysa sıradakileri kaydırır, olmazsa yer değiştirir. */
export function moveTile(slots: Slots, tile: number, target: number): Slots {
  const out = slots.slice();
  const from = out.indexOf(tile);
  if (from < 0 || from === target) return out;
  out[from] = null;
  if (out[target] === null) {
    out[target] = tile;
    return out;
  }
  const rowStart = target - (target % ROW);
  const rowEnd = rowStart + ROW;
  let gap = -1;
  for (let i = target + 1; i < rowEnd; i++) if (out[i] === null) { gap = i; break; }
  if (gap >= 0) {
    for (let i = gap; i > target; i--) out[i] = out[i - 1];
    out[target] = tile;
    return out;
  }
  for (let i = target - 1; i >= rowStart; i--) if (out[i] === null) { gap = i; break; }
  if (gap >= 0) {
    for (let i = gap; i < target; i++) out[i] = out[i + 1];
    out[target] = tile;
    return out;
  }
  out[from] = out[target];
  out[target] = tile;
  return out;
}
