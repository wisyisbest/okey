"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Action } from "@/lib/client";
import { lsGet, lsSet } from "@/lib/client";
import { bestFinish } from "@/lib/okey/bot";
import { arrangeGroups, arrangePairs } from "@/lib/okey/rules";
import { okeyOf } from "@/lib/okey/tiles";
import type { PlayerView } from "@/lib/okey/view";
import { emptySlots, layoutGroups, moveTile, RackShape, reshape, Slots, syncSlots, TALL, WIDE } from "@/lib/rack";
import { useSounds } from "@/lib/sound";
import { SugarBowl, TeaGlass } from "./Decor";
import { ChatPanel, ConfirmLeave, EndOverlay, HistoryModal, Pile, SeatBox } from "./GameParts";
import { Tile, TileBack } from "./Tile";

interface Props {
  view: PlayerView;
  clockOffset: number;
  busy: boolean;
  onAction: (a: Action) => void;
  onLeave: () => void;
}

/** Sürükleme: ıstakadaki bir taş, ortadaki deste ya da soldaki yığın. */
interface Drag {
  kind: "rack" | "deck" | "pile";
  tile: number | null;
  x0: number;
  y0: number;
  moved: boolean;
}

const BUBBLE_MS = 4000;
const rackKey = (code: string, handNo: number, shape: RackShape) => `okey:rack:${code}:${handNo}:${shape.cols}`;

/** Dikey ekranda 3×10, yatayda 2×13 ıstaka. */
function useRackShape(): RackShape {
  const [shape, setShape] = useState<RackShape>(WIDE);
  useEffect(() => {
    const mq = window.matchMedia("(max-aspect-ratio: 1/1)");
    const update = () => setShape(mq.matches ? TALL : WIDE);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return shape;
}

export function Game({ view, clockOffset, busy, onAction, onLeave }: Props) {
  const me = view.mySeat;
  const okey = view.indicator !== null ? okeyOf(view.indicator) : null;
  const myTurn = view.phase === "playing" && view.turn === me;
  const canDraw = myTurn && !view.drawn && !busy;
  const canDiscard = myTurn && view.drawn && !busy;
  const left = (me + 3) % 4;
  const across = (me + 2) % 4;
  const right = (me + 1) % 4;
  const leftPile = view.seats[left]?.discards ?? [];

  const shape = useRackShape();
  const [slots, setSlots] = useState<Slots>(() => emptySlots(WIDE));
  const shapeRef = useRef<RackShape>(WIDE);
  const [selected, setSelected] = useState<number | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ tile: number | null; x: number; y: number } | null>(null);
  const [history, setHistory] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const pendingSlot = useRef<number | null>(null);
  const prevHand = useRef<number[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const sounds = useSounds();
  const serverNow = now + clockOffset;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Oyun ekranında sayfa kaymasın
  useEffect(() => {
    document.body.classList.add("in-game");
    return () => document.body.classList.remove("in-game");
  }, []);

  // Ekran yönü değişince ıstakayı yeni şekle taşı
  useEffect(() => {
    setSlots((s) => reshape(s, shapeRef.current, shape));
    shapeRef.current = shape;
  }, [shape]);

  // Sıra bana gelince titreşim + ses
  const turnKey = `${view.handNo}:${view.turn}:${view.phase}`;
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      sounds.turn();
      try {
        navigator.vibrate?.(60);
      } catch {}
    }
    wasMyTurn.current = myTurn;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  // Taş atılınca / alınınca ses
  const actionKey = view.lastAction ? `${view.lastAction.type}:${view.lastAction.at}` : "";
  useEffect(() => {
    if (!view.lastAction) return;
    if (view.lastAction.type === "discard") sounds.tap();
    else if (view.lastAction.type === "finish") sounds.win();
    else sounds.soft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionKey]);

  // Sunucudaki el değişince ıstakayı eşitle
  const handKey = view.hand.join(",");
  useEffect(() => {
    const hand = view.hand;
    const sh = shapeRef.current;
    setSlots((prev) => {
      let base = prev;
      if (!prevHand.current.length) {
        const saved = lsGet(rackKey(view.code, view.handNo, sh));
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length === sh.cols * sh.rows) base = parsed;
          } catch {}
        }
      }
      const kept = base.filter((t) => t !== null && hand.includes(t)).length;
      if (okey && kept < hand.length / 2) {
        const a = arrangeGroups(hand, okey);
        return layoutGroups([...a.groups, a.rest], sh);
      }
      return syncSlots(base, hand, sh, pendingSlot.current);
    });
    pendingSlot.current = null;
    const added = hand.filter((t) => !prevHand.current.includes(t));
    if (prevHand.current.length && added.length === 1) {
      setFresh(added[0]);
      setTimeout(() => setFresh((f) => (f === added[0] ? null : f)), 2500);
    }
    setSelected((s) => (s !== null && !hand.includes(s) ? null : s));
    prevHand.current = hand;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handKey, view.handNo]);

  useEffect(() => {
    if (slots.length === shape.cols * shape.rows && slots.some((t) => t !== null))
      lsSet(rackKey(view.code, view.handNo, shape), JSON.stringify(slots));
  }, [slots, shape, view.code, view.handNo]);

  // Elim bitiyor mu? (Bitir düğmesini parlatmak için)
  const finishTile = useMemo(
    () => (okey && myTurn && view.drawn && view.hand.length === 15 ? bestFinish(view.hand, okey) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handKey, myTurn, view.drawn, view.indicator],
  );

  function discard(tile: number) {
    if (!canDiscard) return;
    setSelected(null);
    onAction({ type: "discard", tile });
  }

  function finish() {
    const tile = selected ?? finishTile;
    if (tile === null) return;
    onAction({ type: "finish", tile });
  }

  function startDrag(e: React.PointerEvent, kind: Drag["kind"], tile: number | null) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, tile, x0: e.clientX, y0: e.clientY, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8) d.moved = true;
    if (d.moved) setGhost({ tile: d.tile, x: e.clientX, y: e.clientY });
  }

  function cancelDrag() {
    drag.current = null;
    setGhost(null);
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    cancelDrag();
    if (!d) return;
    if (!d.moved) {
      if (d.kind === "rack" && d.tile !== null) {
        sounds.click();
        setSelected((s) => (s === d.tile ? null : d.tile));
      }
      return; // deste / yığın dokunuşu onClick ile işlenir
    }
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 50);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = el?.closest("[data-slot]");
    if (d.kind === "rack" && d.tile !== null) {
      if (slotEl) {
        sounds.click();
        setSlots((s) => moveTile(s, d.tile!, Number(slotEl.getAttribute("data-slot")), shape.cols));
      } else if (el?.closest("[data-drop='discard']")) discard(d.tile);
      return;
    }
    // Desteden ya da yığından ıstakaya sürükleyerek çekme
    if (canDraw && (slotEl || el?.closest(".rack"))) {
      const idx = slotEl ? Number(slotEl.getAttribute("data-slot")) : null;
      pendingSlot.current = idx !== null && slots[idx] === null ? idx : null;
      onAction({ type: "draw", from: d.kind === "deck" ? "deck" : "discard" });
    }
  }

  function onSlotTap(i: number) {
    if (selected === null || slots[i] !== null) return;
    setSlots((s) => moveTile(s, selected, i, shape.cols));
    setSelected(null);
  }

  const deadlineLeft = Math.max(0, view.deadline - serverNow);
  const recent = view.lastAction && serverNow - view.lastAction.at < 1800 ? view.lastAction : null;
  const bubbles = new Map<number, string>();
  for (const m of view.chat) if (serverNow - m.at < BUBBLE_MS && serverNow >= m.at) bubbles.set(m.seat, m.text);

  let status: string;
  if (view.phase !== "playing") status = view.lastEvent;
  else if (myTurn && !view.drawn) status = "Sıra sende: ortadan çek ya da soldaki taşı al";
  else if (myTurn && finishTile !== null) status = "Elin bitiyor! Bitir'e bas";
  else if (myTurn) status = "Atacağın taşı seç ya da sağ alttaki yığına sürükle";
  else status = `${view.seats[view.turn]?.name} oynuyor…`;

  const seatProps = { view, deadlineLeft, now: serverNow };
  const dragHandlers = { onPointerMove, onPointerUp, onPointerCancel: cancelDrag };

  return (
    <div className="game" style={{ ["--cols" as string]: shape.cols, ["--rows" as string]: shape.rows }}>
      <div className="topbar">
        <button className="link" onClick={() => setLeaving(true)}>
          ← Kalk
        </button>
        <span className="code">Oda {view.code}</span>
        <span className="hand-no">{view.handNo}. el</span>
        <span className="event">{view.lastEvent}</span>
        <button className="link icon" onClick={() => setChatOpen((o) => !o)} aria-label="Mesaj">
          💬
        </button>
        <button className="link icon" onClick={sounds.toggle} aria-label="Ses">
          {sounds.muted ? "🔇" : "🔊"}
        </button>
      </div>

      {chatOpen && (
        <ChatPanel
          onSay={(text) => {
            setChatOpen(false);
            onAction({ type: "say", text });
          }}
          onClose={() => setChatOpen(false)}
        />
      )}

      <div className="table">
        <div className="felt">
          <SeatBox {...seatProps} seat={left} area="left" bubble={bubbles.get(left)} />
          <SeatBox {...seatProps} seat={across} area="across" bubble={bubbles.get(across)} />
          <SeatBox {...seatProps} seat={right} area="right" bubble={bubbles.get(right)} />

          {/* Köşelerdeki atılan taş yığınları: her oyuncu sağına atar */}
          <Pile
            area="tl"
            seat={across}
            view={view}
            okey={okey}
            flash={recent?.type === "discard" && recent.seat === across}
            onClick={() => setHistory(across)}
          />
          <Pile
            area="tr"
            seat={right}
            view={view}
            okey={okey}
            flash={recent?.type === "discard" && recent.seat === right}
            onClick={() => setHistory(right)}
          />
          <Pile
            area="bl"
            seat={left}
            view={view}
            okey={okey}
            label={canDraw && leftPile.length ? "Al" : undefined}
            glow={canDraw && leftPile.length > 0}
            flash={recent?.type === "discard" && recent.seat === left}
            onPointerDown={canDraw && leftPile.length ? (e) => startDrag(e, "pile", leftPile[leftPile.length - 1]) : undefined}
            {...dragHandlers}
            onClick={() => {
              if (suppressClick.current) return;
              if (canDraw && leftPile.length) onAction({ type: "draw", from: "discard" });
              else setHistory(left);
            }}
          />
          <Pile
            area="br"
            seat={me}
            view={view}
            okey={okey}
            label={canDiscard ? "At" : undefined}
            glow={canDiscard}
            drop
            flash={recent?.type === "discard" && recent.seat === me}
            onClick={() => (selected !== null && canDiscard ? discard(selected) : setHistory(me))}
          />

          <div className="center">
            <button
              className={`deck ${canDraw ? "glow" : ""} ${recent?.type === "draw" ? "bump" : ""}`}
              disabled={!canDraw || view.deckCount === 0}
              onPointerDown={canDraw ? (e) => startDrag(e, "deck", null) : undefined}
              {...dragHandlers}
              onClick={() => !suppressClick.current && onAction({ type: "draw", from: "deck" })}
            >
              <div className="deck-stack">
                <TileBack />
              </div>
              <span className="deck-count">{view.deckCount}</span>
            </button>
            {view.indicator !== null && (
              <div className="indicator">
                <Tile id={view.indicator} small />
                {view.canShow ? (
                  <button className="show-btn glow" onClick={() => onAction({ type: "show" })}>
                    Göster
                  </button>
                ) : (
                  <span>Gösterge</span>
                )}
              </div>
            )}
          </div>

          <div className="decor decor-me">
            <TeaGlass full={0.75} />
            <SugarBowl />
            {bubbles.has(me) && <div className="bubble me">{bubbles.get(me)}</div>}
          </div>
        </div>
      </div>

      <div className={`status ${myTurn ? "mine" : ""}`}>
        <span className="status-text">{status}</span>
        {myTurn && <span className="timer">{Math.ceil(deadlineLeft / 1000)} sn</span>}
      </div>

      <div className="rack">
        {slots.map((t, i) => (
          <div key={i} className="slot" data-slot={i} onClick={() => onSlotTap(i)}>
            {t !== null && (
              <div
                className={`drag ${ghost?.tile === t ? "dragging" : ""}`}
                onPointerDown={(e) => startDrag(e, "rack", t)}
                {...dragHandlers}
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
            setSlots(layoutGroups([...a.groups, a.rest], shape));
          }}
        >
          Seriye Diz
        </button>
        <button
          onClick={() => {
            if (!okey) return;
            const a = arrangePairs(view.hand, okey);
            setSlots(layoutGroups([...a.groups, a.rest], shape));
          }}
        >
          Çifte Diz
        </button>
        <button className="primary" disabled={!canDiscard || selected === null} onClick={() => selected !== null && discard(selected)}>
          At
        </button>
        <button
          className={`gold ${finishTile !== null ? "glow" : ""}`}
          disabled={!canDiscard || (selected === null && finishTile === null)}
          onClick={finish}
        >
          Bitir
        </button>
      </div>

      {ghost && (
        <div className="ghost" style={{ left: ghost.x, top: ghost.y }}>
          {ghost.tile === null ? <TileBack /> : <Tile id={ghost.tile} okey={okey} />}
        </div>
      )}

      {history !== null && view.seats[history] && (
        <HistoryModal seat={view.seats[history]!} isMe={history === me} okey={okey} onClose={() => setHistory(null)} />
      )}

      {view.phase === "ended" && (
        <EndOverlay view={view} okey={okey} busy={busy} now={serverNow} onAction={onAction} onLeave={() => setLeaving(true)} />
      )}

      {leaving && <ConfirmLeave onConfirm={onLeave} onCancel={() => setLeaving(false)} />}
    </div>
  );
}
