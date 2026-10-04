import { bestFinish, chooseDiscard, shouldTakeDiscard } from "./bot";
import { checkWin } from "./rules";
import { isFake, isJoker, okeyOf, shuffledDeck } from "./tiles";

export const SEATS = 4;
export const BOT_DELAY_MS = 1300;
export const TURN_LIMIT_MS = 30_000;
/** Bu süredir istek atmayan oyuncu "bağlantısı kopmuş" sayılır. */
export const OFFLINE_MS = 12_000;
const OFFLINE_TURN_MS = 3_000;

const BOT_NAMES = ["Bot Ayşe", "Bot Mehmet", "Bot Zeynep", "Bot Ali"];

export interface Player {
  token: string;
  name: string;
  isBot: boolean;
  lastSeen: number;
}

export type Phase = "lobby" | "playing" | "ended";
export type EndType = "normal" | "pairs" | "okey" | "draw";

export interface GameState {
  code: string;
  version: number;
  host: number;
  seats: (Player | null)[];
  phase: Phase;
  handNo: number;
  dealer: number;
  hands: number[][];
  /** Her oyuncunun attığı taşlar; sağındaki oyuncu son taşı alabilir. */
  discards: number[][];
  deck: number[];
  indicator: number;
  turn: number;
  /** Sıradaki oyuncu taş çekti mi (atma aşaması)? */
  drawn: boolean;
  turnStartedAt: number;
  winner: number | null;
  endType: EndType | null;
  winTile: number | null;
  lastEvent: string;
}

export class GameError extends Error {}

export function prevSeat(seat: number) {
  return (seat + SEATS - 1) % SEATS;
}
export function nextSeat(seat: number) {
  return (seat + 1) % SEATS;
}

export function createRoom(code: string, name: string, token: string, now: number): GameState {
  return {
    code,
    version: 1,
    host: 0,
    seats: [{ token, name, isBot: false, lastSeen: now }, null, null, null],
    phase: "lobby",
    handNo: 0,
    dealer: 0,
    hands: [[], [], [], []],
    discards: [[], [], [], []],
    deck: [],
    indicator: 0,
    turn: 0,
    drawn: false,
    turnStartedAt: now,
    winner: null,
    endType: null,
    winTile: null,
    lastEvent: `${name} odayı kurdu`,
  };
}

export function seatOf(state: GameState, token: string): number {
  return state.seats.findIndex((p) => p?.token === token);
}

/** Odaya katılır. Oyun başladıysa bir botun yerine geçer. */
export function joinRoom(state: GameState, name: string, token: string, now: number): number {
  const existing = seatOf(state, token);
  if (existing >= 0) return existing;
  let seat = state.seats.findIndex((p) => p === null);
  if (seat < 0) seat = state.seats.findIndex((p) => p?.isBot);
  if (seat < 0) throw new GameError("Masa dolu");
  state.seats[seat] = { token, name, isBot: false, lastSeen: now };
  state.lastEvent = `${name} masaya oturdu`;
  return seat;
}

export function startGame(state: GameState, seat: number, now: number, rng = Math.random) {
  if (state.phase === "playing") throw new GameError("Oyun zaten başladı");
  if (state.phase === "lobby" && seat !== state.host) throw new GameError("Oyunu oda sahibi başlatır");
  let b = 0;
  for (let s = 0; s < SEATS; s++) {
    if (!state.seats[s]) {
      while (state.seats.some((p) => p?.name === BOT_NAMES[b % BOT_NAMES.length])) b++;
      state.seats[s] = { token: `bot-${s}-${now}`, name: BOT_NAMES[b % BOT_NAMES.length], isBot: true, lastSeen: now };
      b++;
    }
  }
  if (state.handNo > 0) state.dealer = nextSeat(state.dealer);
  deal(state, now, rng);
}

function deal(state: GameState, now: number, rng: () => number) {
  const deck = shuffledDeck(rng);
  // Gösterge sahte okey olamaz
  const ind = deck.findIndex((t) => !isFake(t));
  state.indicator = deck.splice(ind, 1)[0];
  state.hands = [[], [], [], []];
  for (let k = 0; k < SEATS; k++) {
    const s = (state.dealer + k) % SEATS;
    state.hands[s] = deck.splice(0, k === 0 ? 15 : 14);
  }
  state.deck = deck;
  state.discards = [[], [], [], []];
  state.turn = state.dealer;
  state.drawn = true; // ilk oyuncu 15 taşla başlar, sadece atar
  state.turnStartedAt = now;
  state.phase = "playing";
  state.handNo++;
  state.winner = null;
  state.endType = null;
  state.winTile = null;
  state.lastEvent = `${state.handNo}. el başladı`;
}

function assertTurn(state: GameState, seat: number) {
  if (state.phase !== "playing") throw new GameError("Oyun devam etmiyor");
  if (state.turn !== seat) throw new GameError("Sıra sizde değil");
}

export function drawTile(state: GameState, seat: number, from: "deck" | "discard") {
  assertTurn(state, seat);
  if (state.drawn) throw new GameError("Zaten taş çektiniz");
  const name = state.seats[seat]!.name;
  if (from === "discard") {
    const pile = state.discards[prevSeat(seat)];
    if (!pile.length) throw new GameError("Yerde taş yok");
    state.hands[seat].push(pile.pop()!);
    state.lastEvent = `${name} yerden aldı`;
  } else {
    if (!state.deck.length) throw new GameError("Ortada taş kalmadı");
    state.hands[seat].push(state.deck.shift()!);
    state.lastEvent = `${name} ortadan çekti`;
  }
  state.drawn = true;
}

function removeFromHand(state: GameState, seat: number, tile: number) {
  const hand = state.hands[seat];
  const k = hand.indexOf(tile);
  if (k < 0) throw new GameError("Bu taş elinizde değil");
  hand.splice(k, 1);
}

export function discardTile(state: GameState, seat: number, tile: number, now: number) {
  assertTurn(state, seat);
  if (!state.drawn) throw new GameError("Önce taş çekmelisiniz");
  removeFromHand(state, seat, tile);
  state.discards[seat].push(tile);
  state.lastEvent = `${state.seats[seat]!.name} taş attı`;
  if (!state.deck.length) {
    state.phase = "ended";
    state.endType = "draw";
    state.winner = null;
    state.lastEvent = "Ortada taş kalmadı, el berabere";
    return;
  }
  state.turn = nextSeat(seat);
  state.drawn = false;
  state.turnStartedAt = now;
}

export function finishHand(state: GameState, seat: number, tile: number) {
  assertTurn(state, seat);
  if (!state.drawn) throw new GameError("Önce taş çekmelisiniz");
  const okey = okeyOf(state.indicator);
  const rest = state.hands[seat].filter((t) => t !== tile);
  if (rest.length !== state.hands[seat].length - 1) throw new GameError("Bu taş elinizde değil");
  const win = checkWin(rest, okey);
  if (!win) throw new GameError("Eliniz bitmiyor");
  state.hands[seat] = rest;
  state.phase = "ended";
  state.winner = seat;
  state.winTile = tile;
  state.endType = isJoker(tile, okey) ? "okey" : win === "pairs" ? "pairs" : "normal";
  const how = state.endType === "okey" ? " (okey atarak!)" : state.endType === "pairs" ? " (çiftten)" : "";
  state.lastEvent = `${state.seats[seat]!.name} eli bitirdi${how}`;
}

/** Botun (ya da süresi dolan oyuncunun) hamlesi. */
export function autoPlay(state: GameState, seat: number, now: number) {
  const okey = okeyOf(state.indicator);
  if (!state.drawn) {
    const pile = state.discards[prevSeat(seat)];
    const top = pile[pile.length - 1];
    const take = shouldTakeDiscard(state.hands[seat], top, okey);
    drawTile(state, seat, take || !state.deck.length ? "discard" : "deck");
  }
  const fin = bestFinish(state.hands[seat], okey);
  if (fin !== null) return finishHand(state, seat, fin);
  discardTile(state, seat, chooseDiscard(state.hands[seat], okey), now);
}

export function turnDeadline(state: GameState, now: number): number {
  const p = state.seats[state.turn]!;
  if (p.isBot) return state.turnStartedAt + BOT_DELAY_MS;
  if (now - p.lastSeen > OFFLINE_MS) return state.turnStartedAt + OFFLINE_TURN_MS;
  return state.turnStartedAt + TURN_LIMIT_MS;
}

/** Zamanı gelen bot / süre aşımı hamlelerini oynatır. Durum değiştiyse true döner. */
export function advance(state: GameState, now: number): boolean {
  let changed = false;
  for (let guard = 0; guard < 8 && state.phase === "playing"; guard++) {
    const deadline = turnDeadline(state, now);
    if (now < deadline) break;
    // Hamle zamanı geldiği an oynanmış sayılır, böylece arka arkaya botlar aralıklı oynar
    autoPlay(state, state.turn, deadline);
    changed = true;
  }
  return changed;
}
