import {
  canShowIndicator,
  ChatMessage,
  EndType,
  GameState,
  isOnline,
  LastAction,
  NEXT_HAND_MS,
  Phase,
  seatOf,
  TURN_LIMIT_MS,
  turnDeadline,
} from "./game";
import { arrangeGroups } from "./rules";
import { okeyOf } from "./tiles";

export interface SeatView {
  name: string;
  isBot: boolean;
  online: boolean;
  tiles: number;
  /** Bu oyuncunun attığı taşlar (herkese açık), en son atılan en sonda */
  discards: number[];
  score: number;
  delta: number;
}

/** Bir oyuncunun gördüğü durum (diğerlerinin taşları gizli). */
export interface PlayerView {
  code: string;
  version: number;
  now: number;
  mySeat: number;
  host: number;
  phase: Phase;
  handNo: number;
  seats: (SeatView | null)[];
  hand: number[];
  deckCount: number;
  indicator: number | null;
  turn: number;
  drawn: boolean;
  deadline: number;
  turnLimit: number;
  winner: number | null;
  endType: EndType | null;
  winTile: number | null;
  /** El bitince kazananın dizilmiş eli */
  winnerGroups: number[][] | null;
  matchOver: boolean;
  /** Yeni elin kendiliğinden başlayacağı an */
  nextHandAt: number | null;
  lastAction: LastAction | null;
  lastEvent: string;
  chat: ChatMessage[];
  /** Göstergeyi şimdi gösterebilir miyim? */
  canShow: boolean;
}

export function playerView(state: GameState, token: string, now: number): PlayerView {
  const mySeat = seatOf(state, token);
  const started = state.phase !== "lobby";
  let winnerGroups: number[][] | null = null;
  if (state.phase === "ended" && state.winner !== null) {
    const arranged = arrangeGroups(state.hands[state.winner], okeyOf(state.indicator));
    winnerGroups = arranged.rest.length ? [...arranged.groups, arranged.rest] : arranged.groups;
  }
  const current = state.seats[state.turn];
  return {
    code: state.code,
    version: state.version,
    now,
    mySeat,
    host: state.host,
    phase: state.phase,
    handNo: state.handNo,
    seats: state.seats.map((p, s) =>
      p
        ? {
            name: p.name,
            isBot: p.isBot,
            online: isOnline(p, now),
            tiles: state.hands[s].length,
            discards: state.discards[s],
            score: state.scores[s],
            delta: state.lastDelta[s],
          }
        : null,
    ),
    hand: mySeat >= 0 ? state.hands[mySeat] : [],
    deckCount: state.deck.length,
    indicator: started ? state.indicator : null,
    turn: state.turn,
    drawn: state.drawn,
    deadline: state.phase === "playing" ? turnDeadline(state, now) : 0,
    turnLimit: current && !current.isBot ? TURN_LIMIT_MS : 0,
    winner: state.winner,
    endType: state.endType,
    winTile: state.winTile,
    winnerGroups,
    matchOver: state.matchOver,
    nextHandAt: state.phase === "ended" && !state.matchOver ? state.endedAt + NEXT_HAND_MS : null,
    lastAction: state.lastAction,
    lastEvent: state.lastEvent,
    chat: state.chat,
    canShow: mySeat >= 0 && canShowIndicator(state, mySeat),
  };
}
