"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Action } from "@/lib/client";
import { lsGet, lsSet } from "@/lib/client";
import { bestFinish } from "@/lib/okey/bot";
import { arrangeGroups, arrangePairs } from "@/lib/okey/rules";
import { Face, okeyOf } from "@/lib/okey/tiles";
import type { PlayerView, SeatView } from "@/lib/okey/view";
import { emptySlots, layoutGroups, moveTile, ROW, Slots, syncSlots } from "@/lib/rack";
import { useSounds } from "@/lib/sound";
import { SugarBowl, TeaGlass } from "./Decor";
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
  const leftPile = view.seats[left]?.discards ?? [];

  const [slots, setSlots] = useState<Slots>(emptySlots);
  const [selected, setSelected] = useState<number | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ tile: number; x: number; y: number } | null>(null);
  const [history, setHistory] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const prevHand = useRef<number[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const sounds = useSounds();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

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
    setSelected((s) => (s !== null && !hand.includes(s) ? null : s));
    prevHand.current = hand;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handKey, view.handNo]);

  useEffect(() => {
    if (slots.some((t) => t !== null)) lsSet(rackKey(view.code, view.handNo), JSON.stringify(slots));
  }, [slots, view.code, view.handNo]);

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
      sounds.click();
      setSelected((s) => (s === d.tile ? null : d.tile));
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = el?.closest("[data-slot]");
    if (slotEl) {
      sounds.click();
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
  const recent = view.lastAction && now + clockOffset - view.lastAction.at < 1800 ? view.lastAction : null;

  let status: string;
  if (view.phase !== "playing") status = view.lastEvent;
  else if (myTurn && !view.drawn) status = "Sıra sende: ortadan çek ya da soldaki taşı al";
  else if (myTurn && finishTile !== null) status = "Elin bitiyor! Bitir'e bas";
  else if (myTurn) status = "Atacağın taşı seç ya da sağ alttaki yığına sürükle";
  else status = `${view.seats[view.turn]?.name} oynuyor…`;

  const seatProps = { view, deadlineLeft, now: now + clockOffset };

  return (
    <div className="game">
      <div className="topbar">
        <button className="link" onClick={onLeave}>
          ← Çık
        </button>
        <span className="code">Oda {view.code}</span>
        <span className="hand-no">{view.handNo}. el</span>
        <span className="event">{view.lastEvent}</span>
        <button className="link icon" onClick={sounds.toggle} aria-label="Ses">
          {sounds.muted ? "🔇" : "🔊"}
        </button>
      </div>

      <div className="table">
        <div className="felt">
          <SeatBox {...seatProps} seat={left} area="left" />
          <SeatBox {...seatProps} seat={across} area="across" />
          <SeatBox {...seatProps} seat={right} area="right" />

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
            onClick={() => (canDraw && leftPile.length ? onAction({ type: "draw", from: "discard" }) : setHistory(left))}
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
              onClick={() => onAction({ type: "draw", from: "deck" })}
            >
              <div className="deck-stack">
                <TileBack />
              </div>
              <span className="deck-count">{view.deckCount}</span>
            </button>
            {view.indicator !== null && (
              <div className="indicator">
                <Tile id={view.indicator} small />
                <span>Gösterge</span>
              </div>
            )}
          </div>

          <div className="decor decor-me">
            <TeaGlass full={0.75} />
            <SugarBowl />
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
          className={`gold ${finishTile !== null ? "glow" : ""}`}
          disabled={!canDiscard || (selected === null && finishTile === null)}
          onClick={finish}
        >
          Bitir
        </button>
      </div>

      {ghost && (
        <div className="ghost" style={{ left: ghost.x, top: ghost.y }}>
          <Tile id={ghost.tile} okey={okey} />
        </div>
      )}

      {history !== null && view.seats[history] && (
        <HistoryModal seat={view.seats[history]!} isMe={history === me} okey={okey} onClose={() => setHistory(null)} />
      )}

      {view.phase === "ended" && (
        <EndOverlay view={view} okey={okey} busy={busy} now={now + clockOffset} onAction={onAction} onLeave={onLeave} />
      )}
    </div>
  );
}

function SeatBox({
  view,
  seat,
  area,
  deadlineLeft,
  now,
}: {
  view: PlayerView;
  seat: number;
  area: string;
  deadlineLeft: number;
  now: number;
}) {
  const p = view.seats[seat];
  if (!p) return null;
  const active = view.phase === "playing" && view.turn === seat;
  const ratio = active && view.turnLimit ? Math.min(1, deadlineLeft / view.turnLimit) : active ? 1 : 0;
  const thinking = active && p.isBot;
  const justTook = view.lastAction?.seat === seat && view.lastAction.type === "take" && now - view.lastAction.at < 2500;
  return (
    <div className={`seat seat-${area} ${active ? "active" : ""}`}>
      <div className="avatar" style={{ ["--p" as string]: ratio }}>
        <span>{p.isBot ? "🤖" : p.name.slice(0, 1).toLocaleUpperCase("tr")}</span>
      </div>
      <div className="seat-text">
        <div className="seat-name">
          {!p.online && "⚠️ "}
          {p.name}
        </div>
        <div className="seat-info">
          <span className="score">★ {p.score}</span>
          {thinking && <span className="thinking">düşünüyor</span>}
          {justTook && <span className="took">yerden aldı</span>}
        </div>
      </div>
      <TeaGlass full={0.4 + ((seat * 37) % 50) / 100} />
    </div>
  );
}

function Pile({
  area,
  seat,
  view,
  okey,
  label,
  glow,
  drop,
  flash,
  onClick,
}: {
  area: string;
  seat: number;
  view: PlayerView;
  okey: Face | null;
  label?: string;
  glow?: boolean;
  drop?: boolean;
  flash?: boolean;
  onClick: () => void;
}) {
  const pile = view.seats[seat]?.discards ?? [];
  const shown = pile.slice(-3);
  return (
    <button
      className={`pile pile-${area} ${glow ? "glow" : ""} ${flash ? "flash" : ""}`}
      data-drop={drop ? "discard" : undefined}
      onClick={onClick}
    >
      <div className="pile-stack">
        {shown.length === 0 && <div className="tile empty" />}
        {shown.map((t, k) => (
          <div
            key={t}
            className={`pile-tile ${k === shown.length - 1 ? "top" : ""}`}
            style={{ ["--k" as string]: shown.length - 1 - k }}
          >
            <Tile id={t} okey={okey} />
          </div>
        ))}
      </div>
      <span className="pile-label">{label ?? (pile.length ? `${pile.length} taş` : "")}</span>
    </button>
  );
}

function HistoryModal({ seat, isMe, okey, onClose }: { seat: SeatView; isMe: boolean; okey: Face | null; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isMe ? "Attığın taşlar" : `${seat.name} · atılan taşlar`}</h3>
        {seat.discards.length ? (
          <div className="history">
            {seat.discards.map((t, k) => (
              <Tile key={`${t}-${k}`} id={t} okey={okey} small />
            ))}
          </div>
        ) : (
          <p className="muted">Henüz taş atılmadı</p>
        )}
        <button onClick={onClose}>Kapat</button>
      </div>
    </div>
  );
}

function EndOverlay({
  view,
  okey,
  busy,
  now,
  onAction,
  onLeave,
}: {
  view: PlayerView;
  okey: Face | null;
  busy: boolean;
  now: number;
  onAction: (a: Action) => void;
  onLeave: () => void;
}) {
  const winner = view.winner !== null ? view.seats[view.winner] : null;
  let title: string;
  if (view.endType === "draw" || !winner) title = "El berabere bitti";
  else if (view.winner === view.mySeat) title = "Tebrikler, eli kazandın! 🎉";
  else title = `${winner.name} eli kazandı`;
  const how = view.endType === "okey" ? "Okey atarak bitirdi! (×2)" : view.endType === "pairs" ? "Çiftten bitirdi! (×2)" : "";

  const ranking = view.seats
    .map((s, i) => ({ s: s!, i }))
    .filter((x) => x.s)
    .sort((a, b) => b.s.score - a.s.score);
  const champion = view.matchOver ? ranking[0] : null;
  const secondsLeft = view.nextHandAt ? Math.max(0, Math.ceil((view.nextHandAt - now) / 1000)) : 0;

  return (
    <div className="overlay">
      <div className="modal">
        {champion ? (
          <h2>{champion.i === view.mySeat ? "Maçı kazandın! 🏆" : `Maçı ${champion.s.name} kazandı 🏆`}</h2>
        ) : (
          <h2>{title}</h2>
        )}
        {champion && <p className="muted">{title}</p>}
        {how && <p className="how">{how}</p>}
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
        <table className="scores">
          <tbody>
            {ranking.map(({ s, i }) => (
              <tr key={i} className={i === view.mySeat ? "me" : ""}>
                <td>{s.name}</td>
                <td className="delta">{s.delta ? s.delta : ""}</td>
                <td className="pts">★ {s.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions">
          <button className="primary" disabled={busy} onClick={() => onAction({ type: view.matchOver ? "newMatch" : "newHand" })}>
            {view.matchOver ? "Yeni Maç" : `Sonraki El (${secondsLeft})`}
          </button>
          <button onClick={onLeave}>Ana Sayfa</button>
        </div>
      </div>
    </div>
  );
}
