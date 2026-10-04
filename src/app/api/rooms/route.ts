import { cleanName, handle, newToken } from "@/lib/api";
import { createRoom } from "@/lib/okey/game";
import { store } from "@/lib/store";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json().catch(() => ({}));
    const token = newToken();
    for (let i = 0; i < 20; i++) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      if (await store.exists(code)) continue;
      await store.set(createRoom(code, cleanName(body.name), token, Date.now()));
      return { code, token };
    }
    throw new Error("Oda kodu üretilemedi");
  });
}
