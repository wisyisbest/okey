import { effective, Face, faceIndex, isJoker } from "./tiles";

// Elin per/çift analizi. Taşlar 52 elemanlı bir sayaca (renk*13 + sayı-1)
// dönüştürülür, okeyler ayrıca sayılır.

interface Counted {
  counts: number[];
  jokers: number;
}

function count(ids: number[], okey: Face): Counted {
  const counts = new Array(52).fill(0);
  let jokers = 0;
  for (const id of ids) {
    const f = effective(id, okey);
    if (f) counts[faceIndex(f)]++;
    else jokers++;
  }
  return { counts, jokers };
}

function firstIndex(counts: number[]): number {
  for (let i = 0; i < 52; i++) if (counts[i] > 0) return i;
  return -1;
}

/** Bir grup: kullanılan taş indeksleri (-1 = okey/joker), görüntüleme sırasıyla. */
type Cells = number[];

/** i indeksli taşı içeren tüm olası perleri üretir. */
function* groupsContaining(counts: number[], jokers: number, i: number): Generator<Cells> {
  const color = Math.floor(i / 13);
  const num = (i % 13) + 1;

  // Aynı sayı, farklı renk (3 veya 4 taş)
  const others: number[] = [];
  for (let c = 0; c < 4; c++) {
    if (c !== color && counts[c * 13 + num - 1] > 0) others.push(c * 13 + num - 1);
  }
  for (let mask = 0; mask < 1 << others.length; mask++) {
    const chosen = others.filter((_, k) => mask & (1 << k));
    for (const size of [3, 4]) {
      const j = size - 1 - chosen.length;
      if (j < 0 || j > jokers) continue;
      yield [i, ...chosen, ...new Array(j).fill(-1)];
    }
  }

  // Aynı renk ardışık (en az 3). 13'ten sonra 1 gelebilir (değer 14).
  const values = num === 1 ? [1, 14] : [num];
  for (const v of values) {
    for (let s = Math.max(1, v - 12); s <= v; s++) {
      const cells: Cells = [];
      let used = 0;
      let ok = true;
      for (let w = s; w < v; w++) {
        const idx = color * 13 + (w === 14 ? 1 : w) - 1;
        if (counts[idx] > 0) cells.push(idx);
        else {
          cells.push(-1);
          used++;
        }
      }
      if (used > jokers) continue;
      cells.push(i);
      for (let e = v; e <= Math.min(14, s + 12); e++) {
        if (e > v) {
          const idx = color * 13 + (e === 14 ? 1 : e) - 1;
          if (counts[idx] > 0) cells.push(idx);
          else {
            cells.push(-1);
            used++;
          }
          if (used > jokers) {
            ok = false;
            break;
          }
        }
        if (e - s + 1 >= 3) yield [...cells];
      }
      if (!ok) continue;
    }
  }
}

function apply(counts: number[], cells: Cells, sign: 1 | -1): number {
  let j = 0;
  for (const c of cells) {
    if (c === -1) j++;
    else counts[c] += sign;
  }
  return j;
}

function canPartition(counts: number[], jokers: number): boolean {
  const i = firstIndex(counts);
  if (i === -1) return jokers === 0;
  for (const cells of groupsContaining(counts, jokers, i)) {
    const j = apply(counts, cells, -1);
    const ok = canPartition(counts, jokers - j);
    apply(counts, cells, 1);
    if (ok) return true;
  }
  return false;
}

function pairInfo({ counts, jokers }: Counted) {
  let pairs = 0;
  let singles = 0;
  for (const n of counts) {
    pairs += Math.floor(n / 2);
    singles += n % 2;
  }
  return { pairs, singles, jokers };
}

export type WinType = "groups" | "pairs";

/** 14 taşlık el bitmiş mi? */
export function checkWin(ids: number[], okey: Face): WinType | null {
  if (ids.length !== 14) return null;
  const c = count(ids, okey);
  if (canPartition(c.counts.slice(), c.jokers)) return "groups";
  const p = pairInfo(c);
  if (p.singles <= p.jokers) return "pairs";
  return null;
}

interface Best {
  score: number;
  groups: Cells[];
}

function maxCover(counts: number[], jokers: number, memo: Map<string, Best>): Best {
  const i = firstIndex(counts);
  if (i === -1) return { score: 0, groups: [] };
  const key = counts.join(",") + "|" + jokers;
  const hit = memo.get(key);
  if (hit) return hit;

  counts[i]--;
  let best = maxCover(counts, jokers, memo);
  counts[i]++;

  for (const cells of groupsContaining(counts, jokers, i)) {
    const j = apply(counts, cells, -1);
    const r = maxCover(counts, jokers - j, memo);
    apply(counts, cells, 1);
    if (r.score + cells.length > best.score) {
      best = { score: r.score + cells.length, groups: [cells, ...r.groups] };
    }
  }
  memo.set(key, best);
  return best;
}

/** Hücreleri gerçek taş id'lerine çevirir. */
function toIds(ids: number[], okey: Face, groups: Cells[]): { groups: number[][]; rest: number[] } {
  const pool = new Map<number, number[]>();
  for (const id of ids) {
    const f = effective(id, okey);
    const k = f ? faceIndex(f) : -1;
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k)!.push(id);
  }
  const out = groups.map((cells) => cells.map((c) => pool.get(c)!.shift()!));
  const rest = [...pool.values()].flat();
  return { groups: out, rest };
}

/** Taşları en çok per oluşturacak şekilde gruplar (seriye diz). */
export function arrangeGroups(ids: number[], okey: Face) {
  const c = count(ids, okey);
  const best = maxCover(c.counts, c.jokers, new Map());
  const res = toIds(ids, okey, best.groups);
  // Kalan taşları renk/sayıya göre sırala
  res.rest.sort((a, b) => sortKey(a, okey) - sortKey(b, okey));
  return res;
}

/** Taşları çiftlerine göre gruplar (çifte diz). */
export function arrangePairs(ids: number[], okey: Face) {
  const sorted = ids.slice().sort((a, b) => sortKey(a, okey) - sortKey(b, okey));
  const jokers = sorted.filter((id) => isJoker(id, okey));
  const normal = sorted.filter((id) => !isJoker(id, okey));
  const groups: number[][] = [];
  const singles: number[] = [];
  for (let k = 0; k < normal.length; k++) {
    const a = normal[k];
    const b = normal[k + 1];
    if (b !== undefined && sortKey(a, okey) === sortKey(b, okey)) {
      groups.push([a, b]);
      k++;
    } else singles.push(a);
  }
  while (jokers.length && singles.length) groups.push([singles.shift()!, jokers.shift()!]);
  return { groups, rest: [...singles, ...jokers] };
}

export function sortKey(id: number, okey: Face): number {
  const f = effective(id, okey);
  return f ? faceIndex(f) : 100;
}

/**
 * Bot için el değerlendirmesi: pere giren taşlar + yarım perler (ikili).
 * Çift stratejisi de hesaba katılır.
 */
export function handScore(ids: number[], okey: Face): number {
  const c = count(ids, okey);
  const best = maxCover(c.counts.slice(), c.jokers, new Map());

  // Pere girmeyen taşlardan ikili oluşturanlar
  const left = c.counts.slice();
  for (const g of best.groups) for (const x of g) if (x >= 0) left[x]--;
  let partial = 0;
  for (let x = 0; x < 52; x++) {
    if (!left[x]) continue;
    const color = Math.floor(x / 13);
    const n = x % 13;
    let near = false;
    for (const d of [1, 2]) {
      if (n + d < 13 && left[color * 13 + n + d]) near = true;
      if (n - d >= 0 && left[color * 13 + n - d]) near = true;
    }
    if (n === 0 && (left[color * 13 + 12] || left[color * 13 + 11])) near = true;
    for (let cc = 0; cc < 4; cc++) if (cc !== color && left[cc * 13 + n]) near = true;
    if (near) partial += left[x];
  }
  const groupScore = best.score * 10 + partial * 3;

  const p = pairInfo(c);
  const pairScore = (p.pairs * 2 + Math.min(p.jokers, p.singles)) * 10 - 30;
  return Math.max(groupScore, pairScore);
}
