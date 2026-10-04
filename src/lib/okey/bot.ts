import { checkWin, handScore } from "./rules";
import { effective, Face, isJoker } from "./tiles";

/** Yerdeki taşı almak eli iyileştiriyor mu? */
export function shouldTakeDiscard(hand: number[], top: number | undefined, okey: Face): boolean {
  if (top === undefined) return false;
  if (isJoker(top, okey)) return true;
  const withTop = [...hand, top];
  if (bestFinish(withTop, okey) !== null) return true;
  const current = handScore(hand, okey);
  // Aldığımız taş dışında bir taş atarak ulaşılabilecek en iyi el
  let best = -Infinity;
  for (let k = 0; k < hand.length; k++) {
    const rest = withTop.filter((_, idx) => idx !== k);
    best = Math.max(best, handScore(rest, okey));
  }
  return best > current + 5;
}

/** 15 taşlık elde, atınca eli bitiren taş (varsa). Okey atarak bitmek tercih edilir. */
export function bestFinish(hand: number[], okey: Face): number | null {
  const order = [...hand].sort((a, b) => Number(isJoker(b, okey)) - Number(isJoker(a, okey)));
  for (const t of order) {
    const rest = hand.filter((x) => x !== t);
    if (checkWin(rest, okey)) return t;
  }
  return null;
}

export interface DiscardContext {
  /** Sıradaki oyuncunun (atılan taşı alabilecek kişi) yerden aldığı taşlar */
  nextTaken: number[];
  /** Masada görülmüş (atılmış) taşlar */
  seen: number[];
}

/**
 * Taşın sıradaki oyuncuya yarama ihtimali: o oyuncu daha önce aynı renkten yakın
 * sayıları ya da aynı sayının başka renklerini yerden aldıysa riskli sayılır.
 */
function danger(tile: number, okey: Face, ctx: DiscardContext): number {
  const f = effective(tile, okey);
  if (!f) return 0;
  let risk = 0;
  for (const t of ctx.nextTaken) {
    const g = effective(t, okey);
    if (!g) continue;
    if (g.color === f.color && Math.abs(g.num - f.num) <= 2) risk += 2;
    else if (g.num === f.num && g.color !== f.color) risk += 2;
  }
  // İki eşi de masada görülmüşse kimseye yaramaz, güvenli
  const twins = ctx.seen.filter((t) => {
    const g = effective(t, okey);
    return g && g.color === f.color && g.num === f.num;
  }).length;
  return risk - twins;
}

/**
 * 15 taşlık elden atılacak taşı seçer (okey asla atılmaz).
 * Ustalık düşükse en iyi birkaç seçenek arasından rastgele seçer, insan gibi hata yapar.
 */
export function chooseDiscard(
  hand: number[],
  okey: Face,
  skill = 1,
  rng: () => number = Math.random,
  ctx?: DiscardContext,
): number {
  const options = hand
    .filter((t) => !isJoker(t, okey))
    .map((t) => ({
      t,
      score:
        handScore(
          hand.filter((x) => x !== t),
          okey,
        ) - (ctx ? danger(t, okey, ctx) * 3 * skill : 0),
    }))
    .sort((a, b) => b.score - a.score);
  if (!options.length) return hand[0];
  if (rng() < skill) return options[0].t;
  const pool = options.slice(0, Math.min(5, options.length));
  return pool[Math.floor(rng() * pool.length)].t;
}
