import { cleanName, handle, newToken } from "@/lib/api";
import {
  advance,
  discardTile,
  drawTile,
  finishHand,
  GameError,
  joinRoom,
  seatOf,
  startGame,
} from "@/lib/okey/game";
import { playerView } from "@/lib/okey/view";
import { withRoom } from "@/lib/store";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  return handle(async () => {
    const body = await req.json().catch(() => ({}));
    let token: string = typeof body.token === "string" ? body.token : "";
    if (body.type === "join" && !token) token = newToken();

    const view = await withRoom(code, (state) => {
      const now = Date.now();
      if (body.type === "join") {
        joinRoom(state, cleanName(body.name), token, now);
        return playerView(state, token, now);
      }
      const seat = seatOf(state, token);
      if (seat < 0) throw new GameError("Bu masada değilsiniz");
      state.seats[seat]!.lastSeen = now;
      advance(state, now);
      const tile = Number(body.tile);
      switch (body.type) {
        case "start":
        case "newHand":
        case "newMatch":
          startGame(state, seat, now);
          break;
        case "draw":
          drawTile(state, seat, body.from === "discard" ? "discard" : "deck", now);
          break;
        case "discard":
          discardTile(state, seat, tile, now);
          break;
        case "finish":
          finishHand(state, seat, tile, now);
          break;
        default:
          throw new GameError("Geçersiz işlem");
      }
      return playerView(state, token, now);
    });
    return { token, view };
  });
}
