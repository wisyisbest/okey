"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createRoom, lsGet, lsSet, tokenKey } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(lsGet("okey:name") ?? ""), []);

  async function create() {
    if (!name.trim()) return setError("Önce adını yaz");
    setBusy(true);
    try {
      lsSet("okey:name", name.trim());
      const res = await createRoom(name.trim());
      lsSet(tokenKey(res.code), res.token);
      router.push(`/room/${res.code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function join() {
    if (!name.trim()) return setError("Önce adını yaz");
    if (!/^\d{4,5}$/.test(code)) return setError("Oda kodu 5 haneli olmalı");
    lsSet("okey:name", name.trim());
    router.push(`/room/${code}`);
  }

  return (
    <main className="screen">
      <div className="card">
        <div className="logo">
          <span className="tile red">
            <span className="num">1</span>
          </span>
          <span className="tile black">
            <span className="num">2</span>
          </span>
          <span className="tile blue">
            <span className="num">3</span>
          </span>
        </div>
        <h1>Okey</h1>
        <p className="muted">Arkadaşlarınla online oyna, eksik kişileri botlar tamamlasın.</p>
        <input placeholder="Adın" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
        <button className="primary big" disabled={busy} onClick={create}>
          Oda Kur
        </button>
        <div className="divider">ya da</div>
        <div className="row">
          <input
            placeholder="Oda kodu"
            inputMode="numeric"
            maxLength={5}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button onClick={join}>Katıl</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
