import { handle } from "@/lib/api";
import { advance, seatOf } from "@/lib/okey/game";
import { playerView } from "@/lib/okey/view";
import { tryWithRoom } from "@/lib/store";

/** Polling: oyuncunun görünümünü döner, zamanı gelen bot hamlelerini oynatır. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return handle(() =>
    tryWithRoom(code, (state) => {
      const now = Date.now();
      const seat = seatOf(state, token);
      // Her istekte yazmamak için "son görülme" birkaç saniyede bir güncellenir
      if (seat >= 0 && now - state.seats[seat]!.lastSeen > 4000) state.seats[seat]!.lastSeen = now;
      advance(state, now);
      return playerView(state, token, now);
    }),
  );
}
