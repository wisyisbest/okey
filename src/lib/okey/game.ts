import { bestFinish, chooseDiscard, shouldTakeDiscard } from "./bot";
import { checkWin } from "./rules";
import { isFake, isJoker, okeyOf, shuffledDeck } from "./tiles";

export const SEATS = 4;
export const TURN_LIMIT_MS = 45_000;
/** Bu süredir istek atmayan oyuncu "bağlantısı kopmuş" sayılır. */
export const OFFLINE_MS = 15_000;
const OFFLINE_TURN_MS = 4_000;
/** Maçta herkes bu puanla başlar; 0'a düşen olunca maç biter. */
export const START_SCORE = 20;
/** El bitince yeni elin kendiliğinden başlaması için beklenen süre. */
export const NEXT_HAND_MS = 15_000;

const BOT_NAMES = ["Ayşe Teyze", "Mehmet Amca", "Zeynep", "Hasan Dayı", "Fatma", "Kemal Abi"];

export interface Player {
  token: string;
  name: string;
  isBot: boolean;
  lastSeen: number;
  /** Bot için 0..1 arası ustalık; düşükse daha sık hata yapar. */
  skill?: number;
}

export type Phase = "lobby" | "playing" | "ended";
export type EndType = "normal" | "pairs" | "okey" | "draw";

export interface LastAction {
  type: "draw" | "take" | "discard" | "finish";
  seat: number;
  at: number;
}

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
  /** Turun başladığı an (insan için süre sayacı). */
  turnStartedAt: number;
  /** Botun bir sonraki adımı (çekme ya da atma) için zaman. */
  botStepAt: number;
  winner: number | null;
  endType: EndType | null;
  winTile: number | null;
  endedAt: number;
  scores: number[];
  /** Son elde her oyuncunun puan değişimi */
  lastDelta: number[];
  matchOver: boolean;
  lastAction: LastAction | null;
  lastEvent: string;
}

export class GameError extends Error {}

export function prevSeat(seat: number) {
  return (seat + SEATS - 1) % SEATS;
}
export function nextSeat(seat: number) {
  return (seat + 1) % SEATS;
}

const rand = (min: number, max: number, rng: () => number) => min + (max - min) * rng();

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
    botStepAt: now,
    winner: null,
    endType: null,
    winTile: null,
    endedAt: 0,
    scores: new Array(SEATS).fill(START_SCORE),
    lastDelta: new Array(SEATS).fill(0),
    matchOver: false,
    lastAction: null,
    lastEvent: `${name} odayı kurdu`,
  };
}

/** Eski sürümde kaydedilmiş odaları yeni alanlarla tamamlar. */
export function normalize(state: GameState): GameState {
  state.scores ??= new Array(SEATS).fill(START_SCORE);
  state.lastDelta ??= new Array(SEATS).fill(0);
  state.matchOver ??= false;
  state.endedAt ??= 0;
  state.botStepAt ??= state.turnStartedAt;
  state.lastAction ??= null;
  return state;
}

export function seatOf(state: GameState, token: string): number {
  return state.seats.findIndex((p) => p?.token === token);
}

export function isOnline(p: Player, now: number) {
  return p.isBot || now - p.lastSeen < OFFLINE_MS;
}

/** Odaya katılır. Oyun başladıysa bir botun yerine geçer. */
export function joinRoom(state: GameState, name: string, token: string, now: number): number {
  const existing = seatOf(state, token);
  if (existing >= 0) return existing;
  let seat = state.seats.findIndex((p) => p === null);
  if (seat < 0) seat = state.seats.findIndex((p) => p?.isBot);
  if (seat < 0) throw new GameError("Masa dolu");
  const replaced = state.seats[seat];
  state.seats[seat] = { token, name, isBot: false, lastSeen: now };
  state.lastEvent = replaced ? `${name}, ${replaced.name} yerine oturdu` : `${name} masaya oturdu`;
  return seat;
}

function fillBots(state: GameState, now: number, rng: () => number) {
  const free = BOT_NAMES.filter((n) => !state.seats.some((p) => p?.name === n));
  for (let s = 0; s < SEATS; s++) {
    if (state.seats[s]) continue;
    const name = free.splice(Math.floor(rng() * free.length), 1)[0] ?? `Bot ${s + 1}`;
    state.seats[s] = { token: `bot-${s}-${now}`, name, isBot: true, lastSeen: now, skill: rand(0.45, 0.75, rng) };
  }
}

export function startGame(state: GameState, seat: number, now: number, rng = Math.random) {
  if (state.phase === "playing") throw new GameError("Oyun zaten başladı");
  if (state.phase === "lobby" && seat !== state.host) {
    const host = state.seats[state.host];
    if (host && isOnline(host, now)) throw new GameError("Oyunu oda sahibi başlatır");
  }
  fillBots(state, now, rng);
  if (state.matchOver || state.phase === "lobby") {
    state.scores = new Array(SEATS).fill(START_SCORE);
    state.lastDelta = new Array(SEATS).fill(0);
    state.matchOver = false;
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
  state.phase = "playing";
  state.handNo++;
  state.winner = null;
  state.endType = null;
  state.winTile = null;
  state.lastAction = null;
  state.lastEvent = `${state.handNo}. el başladı`;
  beginTurn(state, now + 1500, rng);
}

function beginTurn(state: GameState, now: number, rng: () => number) {
  state.turnStartedAt = now;
  // Bot önce biraz "düşünür", sonra çeker
  state.botStepAt = now + rand(1400, 2800, rng);
}

function assertTurn(state: GameState, seat: number) {
  if (state.phase !== "playing") throw new GameError("Oyun devam etmiyor");
  if (state.turn !== seat) throw new GameError("Sıra sizde değil");
}

export function drawTile(state: GameState, seat: number, from: "deck" | "discard", now = Date.now(), rng = Math.random) {
  assertTurn(state, seat);
  if (state.drawn) throw new GameError("Zaten taş çektiniz");
  const name = state.seats[seat]!.name;
  if (from === "discard") {
    const pile = state.discards[prevSeat(seat)];
    if (!pile.length) throw new GameError("Yerde taş yok");
    state.hands[seat].push(pile.pop()!);
    state.lastEvent = `${name} yerden aldı`;
    state.lastAction = { type: "take", seat, at: now };
  } else {
    if (!state.deck.length) throw new GameError("Ortada taş kalmadı");
    state.hands[seat].push(state.deck.shift()!);
    state.lastEvent = `${name} ortadan çekti`;
    state.lastAction = { type: "draw", seat, at: now };
  }
  state.drawn = true;
  state.botStepAt = now + rand(1000, 2400, rng);
}

function removeFromHand(state: GameState, seat: number, tile: number) {
  const hand = state.hands[seat];
  const k = hand.indexOf(tile);
  if (k < 0) throw new GameError("Bu taş elinizde değil");
  hand.splice(k, 1);
}

export function discardTile(state: GameState, seat: number, tile: number, now: number, rng = Math.random) {
  assertTurn(state, seat);
  if (!state.drawn) throw new GameError("Önce taş çekmelisiniz");
  removeFromHand(state, seat, tile);
  state.discards[seat].push(tile);
  state.lastEvent = `${state.seats[seat]!.name} taş attı`;
  state.lastAction = { type: "discard", seat, at: now };
  if (!state.deck.length) {
    endHand(state, null, "draw", now);
    state.lastEvent = "Ortada taş kalmadı, el berabere";
    return;
  }
  state.turn = nextSeat(seat);
  state.drawn = false;
  beginTurn(state, now, rng);
}

function endHand(state: GameState, winner: number | null, type: EndType, now: number) {
  state.phase = "ended";
  state.winner = winner;
  state.endType = type;
  state.endedAt = now;
  state.lastDelta = new Array(SEATS).fill(0);
  if (winner !== null) {
    // Kazanan dışındakiler puan kaybeder; okey atarak ya da çiftten bitirmek iki katı
    const penalty = type === "normal" ? 2 : 4;
    for (let s = 0; s < SEATS; s++) {
      if (s === winner) continue;
      state.scores[s] -= penalty;
      state.lastDelta[s] = -penalty;
    }
  }
  state.matchOver = state.scores.some((x) => x <= 0);
}

export function finishHand(state: GameState, seat: number, tile: number, now = Date.now()) {
  assertTurn(state, seat);
  if (!state.drawn) throw new GameError("Önce taş çekmelisiniz");
  const okey = okeyOf(state.indicator);
  const rest = state.hands[seat].filter((t) => t !== tile);
  if (rest.length !== state.hands[seat].length - 1) throw new GameError("Bu taş elinizde değil");
  const win = checkWin(rest, okey);
  if (!win) throw new GameError("Eliniz bitmiyor");
  state.hands[seat] = rest;
  state.winTile = tile;
  const type: EndType = isJoker(tile, okey) ? "okey" : win === "pairs" ? "pairs" : "normal";
  state.lastAction = { type: "finish", seat, at: now };
  endHand(state, seat, type, now);
  const how = type === "okey" ? " (okey atarak!)" : type === "pairs" ? " (çiftten)" : "";
  state.lastEvent = `${state.seats[seat]!.name} eli bitirdi${how}`;
}

/** Sıradaki oyuncu için tek adım oynar: çekmediyse çeker, çektiyse atar ya da biter. */
export function autoStep(state: GameState, seat: number, now: number, rng = Math.random) {
  const okey = okeyOf(state.indicator);
  const skill = state.seats[seat]!.skill ?? 0.9;
  if (!state.drawn) {
    const pile = state.discards[prevSeat(seat)];
    const top = pile[pile.length - 1];
    const take = shouldTakeDiscard(state.hands[seat], top, okey) && rng() < 0.4 + skill * 0.6;
    drawTile(state, seat, take ? "discard" : "deck", now, rng);
    return;
  }
  const fin = bestFinish(state.hands[seat], okey);
  if (fin !== null) return finishHand(state, seat, fin, now);
  discardTile(state, seat, chooseDiscard(state.hands[seat], okey, skill, rng), now, rng);
}

export function turnDeadline(state: GameState, now: number): number {
  const p = state.seats[state.turn]!;
  if (p.isBot) return state.botStepAt;
  if (!isOnline(p, now)) return Math.max(state.botStepAt, state.turnStartedAt + OFFLINE_TURN_MS);
  return state.turnStartedAt + TURN_LIMIT_MS;
}

/** Zamanı gelen bot / süre aşımı hamlelerini oynatır, el arası bekleyişi yönetir. */
export function advance(state: GameState, now: number, rng = Math.random): boolean {
  let changed = false;
  for (let guard = 0; guard < 16 && state.phase === "playing"; guard++) {
    const deadline = turnDeadline(state, now);
    if (now < deadline) break;
    const seat = state.turn;
    const human = !state.seats[seat]!.isBot;
    // Hamle zamanı geldiği an oynanmış sayılır, böylece arka arkaya botlar aralıklı oynar
    autoStep(state, seat, deadline, rng);
    // Süresi dolan insanın turunu tek seferde tamamla
    if (human && state.phase === "playing" && state.turn === seat) autoStep(state, seat, deadline, rng);
    changed = true;
  }
  if (state.phase === "ended" && !state.matchOver && now - state.endedAt > NEXT_HAND_MS) {
    startGame(state, state.host, now, rng);
    changed = true;
  }
  return changed;
}
