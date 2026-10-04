"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Action } from "@/lib/client";
import { lsGet, lsSet } from "@/lib/client";
import { arrangeGroups, arrangePairs } from "@/lib/okey/rules";
import { okeyOf } from "@/lib/okey/tiles";
import type { PlayerView } from "@/lib/okey/view";
import { emptySlots, layoutGroups, moveTile, ROW, Slots, syncSlots } from "@/lib/rack";
import { Tile, TileBack } from "./Tile";

interface Props {
  view: PlayerView;
  clockOffset: number;
  busy: boolean;
  onAction: (a: Action) => void;
  onLeave: () => void;
}

interface Drag {
  tile: number;
  x0: number;
  y0: number;
  moved: boolean;
}

const rackKey = (code: string, handNo: number) => `okey:rack:${code}:${handNo}`;

export function Game({ view, clockOffset, busy, onAction, onLeave }: Props) {
  const me = view.mySeat;
  const okey = view.indicator !== null ? okeyOf(view.indicator) : null;
  const myTurn = view.phase === "playing" && view.turn === me;
  const canDraw = myTurn && !view.drawn && !busy;
  const canDiscard = myTurn && view.drawn && !busy;
  const left = (me + 3) % 4;
  const across = (me + 2) % 4;
  const right = (me + 1) % 4;

  const [slots, setSlots] = useState<Slots>(emptySlots);
  const [selected, setSelected] = useState<number | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ tile: number; x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const prevHand = useRef<number[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Sunucudaki el değişince ıstakayı eşitle
  const handKey = view.hand.join(",");
  useEffect(() => {
    const hand = view.hand;
    setSlots((prev) => {
      let base = prev;
      if (!prevHand.current.length) {
        const saved = lsGet(rackKey(view.code, view.handNo));
        if (saved) base = JSON.parse(saved);
      }
      const kept = base.filter((t) => t !== null && hand.includes(t)).length;
      if (okey && kept < hand.length / 2) {
        const a = arrangeGroups(hand, okey);
        return layoutGroups([...a.groups, a.rest]);
      }
      return syncSlots(base, hand);
    });
    const added = hand.filter((t) => !prevHand.current.includes(t));
    if (prevHand.current.length && added.length === 1) {
      setFresh(added[0]);
      setTimeout(() => setFresh((f) => (f === added[0] ? null : f)), 2500);
    }
    if (selected !== null && !hand.includes(selected)) setSelected(null);
    prevHand.current = hand;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handKey, view.handNo]);

  useEffect(() => {
    if (slots.some((t) => t !== null)) lsSet(rackKey(view.code, view.handNo), JSON.stringify(slots));
  }, [slots, view.code, view.handNo]);

  function discard(tile: number) {
    if (!canDiscard) return;
    setSelected(null);
    onAction({ type: "discard", tile });
  }

  function onPointerDown(e: React.PointerEvent, tile: number) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { tile, x0: e.clientX, y0: e.clientY, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8) d.moved = true;
    if (d.moved) setGhost({ tile: d.tile, x: e.clientX, y: e.clientY });
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    if (!d.moved) {
      setSelected((s) => (s === d.tile ? null : d.tile));
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = el?.closest("[data-slot]");
    if (slotEl) {
      setSlots((s) => moveTile(s, d.tile, Number(slotEl.getAttribute("data-slot"))));
      return;
    }
    if (el?.closest("[data-drop='discard']")) discard(d.tile);
  }

  function onSlotTap(i: number) {
    if (selected === null || slots[i] !== null) return;
    setSlots((s) => moveTile(s, selected, i));
    setSelected(null);
  }

  const deadlineLeft = Math.max(0, view.deadline - (now + clockOffset));

  let status: string;
  if (view.phase !== "playing") status = view.lastEvent;
  else if (myTurn && !view.drawn) status = "Sıra sende: ortadan ya da soldaki taşı al";
  else if (myTurn) status = "Bir taş seç, at ya da bitir";
  else status = `${view.seats[view.turn]?.name} oynuyor…`;

  return (
    <div className="game">
      <div className="topbar">
        <button className="link" onClick={onLeave}>
          ← Çık
        </button>
        <span className="code">Oda {view.code}</span>
        <span className="event">{view.lastEvent}</span>
      </div>

      <div className="board">
        <div className="side left">
          <SeatBox view={view} seat={left} deadlineLeft={deadlineLeft} />
          <button
            className={`pile ${canDraw && view.seats[left]?.discardTop != null ? "glow" : ""}`}
            disabled={!canDraw || view.seats[left]?.discardTop == null}
            onClick={() => onAction({ type: "draw", from: "discard" })}
          >
            {view.seats[left]?.discardTop != null ? <Tile id={view.seats[left]!.discardTop!} okey={okey} /> : <div className="tile empty" />}
            <span className="pile-label">Al</span>
          </button>
        </div>

        <div className="middle">
          <SeatBox view={view} seat={across} deadlineLeft={deadlineLeft} />
          <div className="center">
          <button
            className={`deck ${canDraw ? "glow" : ""}`}
            disabled={!canDraw || view.deckCount === 0}
            onClick={() => onAction({ type: "draw", from: "deck" })}
          >
            <TileBack />
            <span className="deck-count">{view.deckCount}</span>
          </button>
          {view.indicator !== null && (
            <div className="indicator">
              <Tile id={view.indicator} small />
              <span>Gösterge</span>
            </div>
          )}
          </div>
        </div>

        <div className="side right">
          <SeatBox view={view} seat={right} deadlineLeft={deadlineLeft} />
          <div className={`pile drop ${canDiscard ? "glow" : ""}`} data-drop="discard" onClick={() => selected !== null && discard(selected)}>
            {view.seats[me]?.discardTop != null ? <Tile id={view.seats[me]!.discardTop!} okey={okey} /> : <div className="tile empty" />}
            <span className="pile-label">At</span>
          </div>
        </div>
      </div>

      <div className={`status ${myTurn ? "mine" : ""}`}>
        {status}
        {myTurn && <span className="timer">{Math.ceil(deadlineLeft / 1000)} sn</span>}
      </div>

      <div className="rack" style={{ ["--cols" as string]: ROW }}>
        {slots.map((t, i) => (
          <div key={i} className="slot" data-slot={i} onClick={() => onSlotTap(i)}>
            {t !== null && (
              <div
                className={`drag ${ghost?.tile === t ? "dragging" : ""}`}
                onPointerDown={(e) => onPointerDown(e, t)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  drag.current = null;
                  setGhost(null);
                }}
              >
                <Tile id={t} okey={okey} selected={selected === t} fresh={fresh === t} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="actions">
        <button
          onClick={() => {
            if (!okey) return;
            const a = arrangeGroups(view.hand, okey);
            setSlots(layoutGroups([...a.groups, a.rest]));
          }}
        >
          Seriye Diz
        </button>
        <button
          onClick={() => {
            if (!okey) return;
            const a = arrangePairs(view.hand, okey);
            setSlots(layoutGroups([...a.groups, a.rest]));
          }}
        >
          Çifte Diz
        </button>
        <button className="primary" disabled={!canDiscard || selected === null} onClick={() => selected !== null && discard(selected)}>
          At
        </button>
        <button
          className="gold"
          disabled={!canDiscard || selected === null}
          onClick={() => {
            if (selected === null) return;
            onAction({ type: "finish", tile: selected });
          }}
        >
          Bitir
        </button>
      </div>

      {ghost && (
        <div className="ghost" style={{ left: ghost.x, top: ghost.y }}>
          <Tile id={ghost.tile} okey={okey} />
        </div>
      )}

      {view.phase === "ended" && <EndOverlay view={view} okey={okey} busy={busy} onAction={onAction} onLeave={onLeave} />}
    </div>
  );
}

function SeatBox({ view, seat, className, deadlineLeft }: { view: PlayerView; seat: number; className?: string; deadlineLeft: number }) {
  const p = view.seats[seat];
  if (!p) return null;
  const active = view.phase === "playing" && view.turn === seat;
  const total = p.isBot ? 1300 : 30000;
  return (
    <div className={`seat ${className ?? ""} ${active ? "active" : ""}`}>
      <div className="seat-name">
        {p.isBot ? "🤖 " : p.online ? "" : "⚠️ "}
        {p.name}
      </div>
      <div className="seat-info">{p.tiles} taş</div>
      {active && <div className="bar" style={{ width: `${Math.min(100, (deadlineLeft / total) * 100)}%` }} />}
    </div>
  );
}

function EndOverlay({
  view,
  okey,
  busy,
  onAction,
  onLeave,
}: {
  view: PlayerView;
  okey: ReturnType<typeof okeyOf> | null;
  busy: boolean;
  onAction: (a: Action) => void;
  onLeave: () => void;
}) {
  const winner = view.winner !== null ? view.seats[view.winner] : null;
  const title = useMemo(() => {
    if (view.endType === "draw" || !winner) return "El berabere bitti";
    if (view.winner === view.mySeat) return "Tebrikler, kazandın! 🎉";
    return `${winner.name} kazandı`;
  }, [view.endType, view.winner, view.mySeat, winner]);
  const how = view.endType === "okey" ? "Okey atarak bitirdi!" : view.endType === "pairs" ? "Çiftten bitirdi" : "";

  return (
    <div className="overlay">
      <div className="modal">
        <h2>{title}</h2>
        {how && <p>{how}</p>}
        {view.winnerGroups && (
          <div className="win-hand">
            {view.winnerGroups.map((g, k) => (
              <div key={k} className="win-group">
                {g.map((t) => (
                  <Tile key={t} id={t} okey={okey} small />
                ))}
              </div>
            ))}
            {view.winTile !== null && (
              <div className="win-group thrown">
                <Tile id={view.winTile} okey={okey} small />
              </div>
            )}
          </div>
        )}
        <div className="modal-actions">
          <button className="primary" disabled={busy} onClick={() => onAction({ type: "newHand" })}>
            Yeni El
          </button>
          <button onClick={onLeave}>Ana Sayfa</button>
        </div>
      </div>
    </div>
  );
}
