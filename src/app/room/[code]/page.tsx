"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "@/components/Game";
import { Lobby } from "@/components/Lobby";
import { Action, ApiError, fetchView, lsGet, lsRemove, lsSet, sendAction, tokenKey } from "@/lib/client";
import type { PlayerView } from "@/lib/okey/view";

const POLL_MS = 800;

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const clockOffset = useRef(0);
  const inFlight = useRef(false);

  const applyView = useCallback((v: PlayerView) => {
    clockOffset.current = v.now - Date.now();
    setView((old) => (old && old.version > v.version ? old : v));
  }, []);

  const join = useCallback(
    async (playerName: string) => {
      setBusy(true);
      try {
        lsSet("okey:name", playerName);
        const res = await sendAction(code, "", { type: "join", name: playerName });
        lsSet(tokenKey(code), res.token);
        setToken(res.token);
        applyView(res.view);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [code, applyView],
  );

  // İlk açılış: kayıtlı kimlik varsa kullan, yoksa kayıtlı isimle otomatik katıl
  useEffect(() => {
    const saved = lsGet(tokenKey(code));
    const savedName = lsGet("okey:name") ?? "";
    setName(savedName);
    if (saved) setToken(saved);
    else if (savedName) join(savedName);
    setReady(true);
  }, [code, join]);

  // Polling
  useEffect(() => {
    if (!token) return;
    let stop = false;
    const tick = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const v = await fetchView(code, token);
        if (stop) return;
        if (v.mySeat < 0) {
          // Kimlik geçersiz (ör. masa doldu ya da oda yenilendi)
          setToken(null);
          return;
        }
        applyView(v);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
      } finally {
        inFlight.current = false;
      }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [code, token, applyView]);

  const act = useCallback(
    async (a: Action) => {
      if (!token) return;
      setBusy(true);
      try {
        const res = await sendAction(code, token, a);
        applyView(res.view);
      } catch (e) {
        setError((e as Error).message);
        setTimeout(() => setError(null), 2500);
      } finally {
        setBusy(false);
      }
    },
    [code, token, applyView],
  );

  // Masadan kalk: lobide koltuk boşalır, oyunda yerine bot oynar
  const leave = async () => {
    if (token) {
      try {
        await sendAction(code, token, { type: "leave" });
      } catch {
        // bağlantı yoksa da çık
      }
      lsRemove(tokenKey(code));
    }
    router.push("/");
  };

  if (notFound) {
    return (
      <main className="screen">
        <div className="card">
          <h1>Oda bulunamadı</h1>
          <p className="muted">Kod yanlış olabilir ya da odanın süresi dolmuş.</p>
          <button className="primary" onClick={() => router.push("/")}>
            Ana sayfa
          </button>
        </div>
      </main>
    );
  }

  if (ready && !token && !busy) {
    return (
      <main className="screen">
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) join(name.trim());
          }}
        >
          <h1>Oda {code}</h1>
          <input placeholder="Adın" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} autoFocus />
          <button className="primary big" type="submit" disabled={!name.trim()}>
            Masaya Otur
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="screen">
        <p className="muted">Yükleniyor…</p>
      </main>
    );
  }

  return (
    <>
      {view.phase === "lobby" ? (
        <Lobby view={view} busy={busy} onStart={() => act({ type: "start" })} onLeave={leave} />
      ) : (
        <Game view={view} clockOffset={clockOffset.current} busy={busy} onAction={act} onLeave={leave} />
      )}
      {error && <div className="toast">{error}</div>}
    </>
  );
}
