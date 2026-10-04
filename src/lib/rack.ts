// Istaka düzeni: `rows` sıra × `cols` yuva. Yalnızca istemcide tutulur.
// Yatay ekranda 2×13, dikey ekranda 3×10 kullanılır.

export interface RackShape {
  cols: number;
  rows: number;
}

export const WIDE: RackShape = { cols: 13, rows: 2 };
export const TALL: RackShape = { cols: 10, rows: 3 };

export type Slots = (number | null)[];

export function emptySlots(shape: RackShape): Slots {
  return new Array(shape.cols * shape.rows).fill(null);
}

/** Grupları aralarında birer boşlukla sıralara yerleştirir. */
export function layoutGroups(groups: number[][], shape: RackShape): Slots {
  const slots = emptySlots(shape);
  let row = 0;
  let col = 0;
  for (const g of groups) {
    if (!g.length) continue;
    if (col + g.length > shape.cols) {
      row++;
      col = 0;
    }
    if (row >= shape.rows || g.length > shape.cols) return compact(groups.flat(), shape);
    g.forEach((t, k) => (slots[row * shape.cols + col + k] = t));
    col += g.length + 1;
  }
  return slots;
}

function compact(tiles: number[], shape: RackShape): Slots {
  const slots = emptySlots(shape);
  tiles.forEach((t, k) => (slots[k] = t));
  return slots;
}

/** Istakadaki boşluklarla ayrılmış taş grupları (soldan sağa, yukarıdan aşağı). */
export function groupsOf(slots: Slots, cols: number): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  slots.forEach((t, i) => {
    if (i % cols === 0 && cur.length) {
      groups.push(cur);
      cur = [];
    }
    if (t === null) {
      if (cur.length) groups.push(cur);
      cur = [];
    } else cur.push(t);
  });
  if (cur.length) groups.push(cur);
  return groups;
}

/** Ekran yönü değişince düzeni yeni şekle taşır (grupları koruyarak). */
export function reshape(slots: Slots, from: RackShape, to: RackShape): Slots {
  if (from.cols === to.cols && from.rows === to.rows) return slots;
  return layoutGroups(groupsOf(slots, from.cols), to);
}

/** Sunucudaki el ile düzeni eşitler: giden taşları siler, yenileri boş yuvaya koyar. */
export function syncSlots(slots: Slots, hand: number[], shape: RackShape, prefer?: number | null): Slots {
  const set = new Set(hand);
  const out = slots.map((t) => (t !== null && set.has(t) ? t : null));
  const placed = new Set(out.filter((t): t is number => t !== null));
  for (const t of hand) {
    if (placed.has(t)) continue;
    let k = prefer != null && out[prefer] === null ? prefer : -1;
    // Önce ilk sıranın sonundaki boşluk, sonra herhangi bir boşluk
    if (k < 0) for (let i = shape.cols - 1; i >= 0 && out[i] === null; i--) k = i;
    if (k < 0) k = out.indexOf(null);
    out[k] = t;
    prefer = null;
  }
  return out;
}

/** Taşı hedef yuvaya taşır; doluysa sıradakileri kaydırır, olmazsa yer değiştirir. */
export function moveTile(slots: Slots, tile: number, target: number, cols: number): Slots {
  const out = slots.slice();
  const from = out.indexOf(tile);
  if (from < 0 || from === target) return out;
  out[from] = null;
  if (out[target] === null) {
    out[target] = tile;
    return out;
  }
  const rowStart = target - (target % cols);
  const rowEnd = rowStart + cols;
  let gap = -1;
  for (let i = target + 1; i < rowEnd; i++)
    if (out[i] === null) {
      gap = i;
      break;
    }
  if (gap >= 0) {
    for (let i = gap; i > target; i--) out[i] = out[i - 1];
    out[target] = tile;
    return out;
  }
  for (let i = target - 1; i >= rowStart; i--)
    if (out[i] === null) {
      gap = i;
      break;
    }
  if (gap >= 0) {
    for (let i = gap; i < target; i++) out[i] = out[i + 1];
    out[target] = tile;
    return out;
  }
  out[from] = out[target];
  out[target] = tile;
  return out;
}
