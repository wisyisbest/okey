import { cleanName, clientIp, handle, newToken, rateLimit } from "@/lib/api";
import { createRoom } from "@/lib/okey/game";
import { store } from "@/lib/store";

export async function POST(req: Request) {
  return handle(async () => {
    rateLimit(`create:${clientIp(req)}`, 10, 60_000);
    const body = await req.json().catch(() => ({}));
    const token = newToken();
    for (let i = 0; i < 20; i++) {
      const code = String(Math.floor(10000 + Math.random() * 90000));
      if (await store.create(createRoom(code, cleanName(body.name), token, Date.now()))) return { code, token };
    }
    throw new Error("Oda kodu üretilemedi");
  });
}
