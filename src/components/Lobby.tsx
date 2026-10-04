"use client";

import { useState } from "react";
import type { PlayerView } from "@/lib/okey/view";

interface Props {
  view: PlayerView;
  busy: boolean;
  onStart: () => void;
  onLeave: () => void;
}

export function Lobby({ view, busy, onStart, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = view.mySeat === view.host;

  async function share() {
    const url = `${location.origin}/room/${view.code}`;
    const text = `Okey masama gel! Oda kodu: ${view.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Okey", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // kullanıcı iptal etti
    }
  }

  return (
    <main className="screen">
      <div className="card">
        <h1>Oda {view.code}</h1>
        <p className="muted">Arkadaşlarını davet et. Boş kalan yerlere bot oturur.</p>
        <ul className="seats">
          {view.seats.map((p, s) => (
            <li key={s} className={p ? "" : "empty"}>
              <span>{p ? p.name : "Boş (bot oturacak)"}</span>
              {s === view.host && <span className="badge">Oda sahibi</span>}
              {s === view.mySeat && <span className="badge me">Sen</span>}
            </li>
          ))}
        </ul>
        <button onClick={share}>{copied ? "Link kopyalandı ✓" : "Davet linkini paylaş"}</button>
        {isHost ? (
          <button className="primary big" disabled={busy} onClick={onStart}>
            Oyunu Başlat
          </button>
        ) : (
          <p className="muted">Oda sahibinin oyunu başlatması bekleniyor…</p>
        )}
        <button className="link" onClick={onLeave}>
          Ana sayfaya dön
        </button>
      </div>
    </main>
  );
}
