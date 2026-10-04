import { bestFinish, chooseDiscard, shouldTakeDiscard } from "./bot";
import { BOT_LOSE_LINES, BOT_WIN_LINES, isAllowedMessage } from "./chat";
import { checkWin } from "./rules";
import { face, isFake, isJoker, okeyOf, shuffledDeck } from "./tiles";

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
  /** Masadan kalkan oyuncunun adı (yerine bot oynuyorsa); aynı adla dönünce koltuğu geri alır. */
  formerName?: string;
}

export interface ChatMessage {
  seat: number;
  text: string;
  at: number;
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
  /** Her oyuncunun yerden aldığı taşlar (herkese açık bilgi; botlar takip eder) */
  taken: number[][];
  /** Bu elde göstergeyi gösterenler */
  shown: boolean[];
  chat: ChatMessage[];
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
    taken: [[], [], [], []],
    shown: new Array(SEATS).fill(false),
    chat: [],
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
  state.taken ??= [[], [], [], []];
  state.shown ??= new Array(SEATS).fill(false);
  state.chat ??= [];
  return state;
}

export function seatOf(state: GameState, token: string): number {
  return state.seats.findIndex((p) => p?.token === token);
}

export function isOnline(p: Player, now: number) {
  return p.isBot || now - p.lastSeen < OFFLINE_MS;
}

/**
 * Odaya katılır. Aynı adla bağlantısı kopmuş bir oyuncu ya da masadan kalkmış biri
 * varsa onun koltuğunu geri alır; yoksa boş yere, oyun başladıysa bir botun yerine oturur.
 */
export function joinRoom(state: GameState, name: string, token: string, now: number): number {
  const existing = seatOf(state, token);
  if (existing >= 0) return existing;
  const same = (n?: string) => !!n && n.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr");
  let seat = state.seats.findIndex((p) => p && !p.isBot && !isOnline(p, now) && same(p.name));
  if (seat < 0) seat = state.seats.findIndex((p) => p?.isBot && same(p.formerName));
  if (seat < 0) seat = state.seats.findIndex((p) => p === null);
  if (seat < 0) seat = state.seats.findIndex((p) => p?.isBot);
  if (seat < 0) throw new GameError("Masa dolu");
  const replaced = state.seats[seat];
  state.seats[seat] = { token, name, isBot: false, lastSeen: now };
  if (!replaced) state.lastEvent = `${name} masaya oturdu`;
  else if (replaced.isBot && !same(replaced.formerName)) state.lastEvent = `${name}, ${replaced.name} yerine oturdu`;
  else state.lastEvent = `${name} masaya geri döndü`;
  return seat;
}

/** Masadan kalkar: lobide koltuk boşalır, oyunda yerine bot oynar. */
export function leaveRoom(state: GameState, seat: number, now: number) {
  const p = state.seats[seat];
  if (!p || p.isBot) return;
  if (state.phase === "lobby") {
    state.seats[seat] = null;
    if (state.host === seat) {
      const next = state.seats.findIndex((x) => x && !x.isBot);
      if (next >= 0) state.host = next;
    }
  } else {
    state.seats[seat] = { token: `bot-${seat}-${now}`, name: p.name, isBot: true, lastSeen: now, skill: 0.6, formerName: p.name };
    if (state.phase === "playing" && state.turn === seat) state.botStepAt = Math.max(state.botStepAt, now + 1200);
  }
  state.lastEvent = state.phase === "lobby" ? `${p.name} odadan ayrıldı` : `${p.name} masadan kalktı, yerine bot oynuyor`;
}

/** Göstergenin eşini elinde tutan, ilk taşını atmadan önce gösterip diğerlerinden 1 puan alır. */
export function canShowIndicator(state: GameState, seat: number): boolean {
  if (state.phase !== "playing" || state.turn !== seat || state.shown[seat]) return false;
  if (state.discards[seat].length > 0) return false;
  const ind = face(state.indicator);
  return state.hands[seat].some((t) => {
    const f = face(t);
    return f.color === ind.color && f.num === ind.num;
  });
}

export function showIndicator(state: GameState, seat: number) {
  if (!canShowIndicator(state, seat)) throw new GameError("Gösterge gösterilemez");
  state.shown[seat] = true;
  for (let s = 0; s < SEATS; s++) if (s !== seat) state.scores[s] -= 1;
  state.lastEvent = `${state.seats[seat]!.name} göstergeyi gösterdi (diğerleri -1)`;
}

const CHAT_LIMIT = 12;

export function say(state: GameState, seat: number, text: string, now: number) {
  if (!isAllowedMessage(text)) throw new GameError("Geçersiz mesaj");
  const last = [...state.chat].reverse().find((m) => m.seat === seat);
  if (last && now - last.at < 1500) throw new GameError("Biraz yavaş 🙂");
  state.chat = [...state.chat, { seat, text, at: now }].slice(-CHAT_LIMIT);
}

function botSay(state: GameState, seat: number, lines: string[], now: number, rng: () => number) {
  state.chat = [...state.chat, { seat, text: lines[Math.floor(rng() * lines.length)], at: now }].slice(-CHAT_LIMIT);
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
  state.taken = [[], [], [], []];
  state.shown = new Array(SEATS).fill(false);
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
    const tile = pile.pop()!;
    state.hands[seat].push(tile);
    state.taken[seat].push(tile);
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

export function finishHand(state: GameState, seat: number, tile: number, now = Date.now(), rng = Math.random) {
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
  // Botlar ara sıra laf atar
  if (state.seats[seat]!.isBot && rng() < 0.6) botSay(state, seat, BOT_WIN_LINES, now + 300, rng);
  const loser = state.seats.findIndex((p, s) => s !== seat && p?.isBot);
  if (loser >= 0 && rng() < 0.5) botSay(state, loser, BOT_LOSE_LINES, now + 1200, rng);
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
  if (canShowIndicator(state, seat) && rng() < 0.9) showIndicator(state, seat);
  const fin = bestFinish(state.hands[seat], okey);
  if (fin !== null) return finishHand(state, seat, fin, now, rng);
  const context = { nextTaken: state.taken[nextSeat(seat)], seen: state.discards.flat() };
  discardTile(state, seat, chooseDiscard(state.hands[seat], okey, skill, rng, context), now, rng);
}

export function turnDeadline(state: GameState, now: number): number {
  const p = state.seats[state.turn]!;
  if (p.isBot) return state.botStepAt;
  if (!isOnline(p, now)) return Math.max(state.botStepAt, state.turnStartedAt + OFFLINE_TURN_MS);
  return state.turnStartedAt + TURN_LIMIT_MS;
}

/** advance() bir şey değiştirecek mi? (polling'de gereksiz yazmayı önler) */
export function needsAdvance(state: GameState, now: number): boolean {
  if (state.phase === "playing") return now >= turnDeadline(state, now);
  return state.phase === "ended" && !state.matchOver && now - state.endedAt > NEXT_HAND_MS;
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
