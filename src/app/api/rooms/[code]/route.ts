import { handle } from "@/lib/api";
import { advance, needsAdvance, seatOf } from "@/lib/okey/game";
import { playerView } from "@/lib/okey/view";
import { pollRoom } from "@/lib/store";

const SEEN_EVERY_MS = 5000;

/** Polling: oyuncunun görünümünü döner, zamanı gelen bot hamlelerini oynatır. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const now = Date.now();
  return handle(() =>
    pollRoom(
      code,
      (state) => {
        const seat = seatOf(state, token);
        const stale = seat >= 0 && now - state.seats[seat]!.lastSeen > SEEN_EVERY_MS;
        return stale || needsAdvance(state, now);
      },
      (state) => {
        const seat = seatOf(state, token);
        if (seat >= 0 && now - state.seats[seat]!.lastSeen > SEEN_EVERY_MS) state.seats[seat]!.lastSeen = now;
        advance(state, now);
        return playerView(state, token, now);
      },
    ),
  );
}
