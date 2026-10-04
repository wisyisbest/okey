import { EndType, GameState, OFFLINE_MS, Phase, prevSeat, seatOf, turnDeadline } from "./game";
import { arrangeGroups } from "./rules";
import { okeyOf } from "./tiles";

export interface SeatView {
  name: string;
  isBot: boolean;
  online: boolean;
  tiles: number;
  discardTop: number | null;
  discardCount: number;
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
  winner: number | null;
  endType: EndType | null;
  winTile: number | null;
  /** El bitince kazananın dizilmiş eli */
  winnerGroups: number[][] | null;
  lastEvent: string;
}

export function playerView(state: GameState, token: string, now: number): PlayerView {
  const mySeat = seatOf(state, token);
  const started = state.phase !== "lobby";
  let winnerGroups: number[][] | null = null;
  if (state.phase === "ended" && state.winner !== null) {
    const arranged = arrangeGroups(state.hands[state.winner], okeyOf(state.indicator));
    winnerGroups = arranged.rest.length ? [...arranged.groups, arranged.rest] : arranged.groups;
  }
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
            online: p.isBot || now - p.lastSeen < OFFLINE_MS,
            tiles: state.hands[s].length,
            discardTop: state.discards[s].at(-1) ?? null,
            discardCount: state.discards[s].length,
          }
        : null,
    ),
    hand: mySeat >= 0 ? state.hands[mySeat] : [],
    deckCount: state.deck.length,
    indicator: started ? state.indicator : null,
    turn: state.turn,
    drawn: state.drawn,
    deadline: state.phase === "playing" ? turnDeadline(state, now) : 0,
    winner: state.winner,
    endType: state.endType,
    winTile: state.winTile,
    winnerGroups,
    lastEvent: state.lastEvent,
  };
}

export { prevSeat };
