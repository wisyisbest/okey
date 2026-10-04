"use client";

import { useState } from "react";
import type { Action } from "@/lib/client";
import { QUICK_EMOJIS, QUICK_MESSAGES } from "@/lib/okey/chat";
import type { Face } from "@/lib/okey/tiles";
import type { PlayerView, SeatView } from "@/lib/okey/view";
import { TeaGlass } from "./Decor";
import { Tile } from "./Tile";

export function SeatBox({
  view,
  seat,
  area,
  deadlineLeft,
  now,
  bubble,
}: {
  view: PlayerView;
  seat: number;
  area: string;
  deadlineLeft: number;
  now: number;
  bubble?: string;
}) {
  const p = view.seats[seat];
  if (!p) return <div className={`seat seat-${area} empty`} />;
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
          {/* Sabit genişlikli; içerik değişince masa kaymasın */}
          <span className={`dots ${thinking ? "on" : ""}`} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
      <TeaGlass full={0.4 + ((seat * 37) % 50) / 100} />
      {justTook && <span className="seat-badge">yerden aldı</span>}
      {bubble && <span className="bubble">{bubble}</span>}
    </div>
  );
}

export function Pile({
  area,
  seat,
  view,
  okey,
  label,
  glow,
  drop,
  flash,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
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
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: () => void;
}) {
  const pile = view.seats[seat]?.discards ?? [];
  const shown = pile.slice(-3);
  return (
    <button
      className={`pile pile-${area} ${glow ? "glow" : ""} ${flash ? "flash" : ""} ${onPointerDown ? "draggable" : ""}`}
      data-drop={drop ? "discard" : undefined}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerDown ? onPointerMove : undefined}
      onPointerUp={onPointerDown ? onPointerUp : undefined}
      onPointerCancel={onPointerDown ? onPointerCancel : undefined}
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

export function HistoryModal({
  seat,
  isMe,
  okey,
  onClose,
}: {
  seat: SeatView;
  isMe: boolean;
  okey: Face | null;
  onClose: () => void;
}) {
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

export function ChatPanel({ onSay, onClose }: { onSay: (text: string) => void; onClose: () => void }) {
  return (
    <div className="chat-layer" onClick={onClose}>
      <div className="chat-panel" onClick={(e) => e.stopPropagation()}>
        <div className="chat-emojis">
          {QUICK_EMOJIS.map((e) => (
            <button key={e} onClick={() => onSay(e)}>
              {e}
            </button>
          ))}
        </div>
        <div className="chat-messages">
          {QUICK_MESSAGES.map((m) => (
            <button key={m} onClick={() => onSay(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ConfirmLeave({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <h3>Masadan kalkılsın mı?</h3>
        <p className="muted">Yerine bot oynar. Aynı linkle ve aynı adla dönersen koltuğunu geri alırsın.</p>
        <div className="modal-actions">
          <button className="primary" onClick={onConfirm}>
            Kalk
          </button>
          <button onClick={onCancel}>Vazgeç</button>
        </div>
      </div>
    </div>
  );
}

export function EndOverlay({
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
  const [minimized, setMinimized] = useState(false);
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
  const heading = champion
    ? champion.i === view.mySeat
      ? "Maçı kazandın! 🏆"
      : `Maçı ${champion.s.name} kazandı 🏆`
    : title;
  const nextButton = (
    <button className="primary" disabled={busy} onClick={() => onAction({ type: view.matchOver ? "newMatch" : "newHand" })}>
      {view.matchOver ? "Yeni Maç" : `Sonraki El (${secondsLeft})`}
    </button>
  );

  if (minimized) {
    return (
      <div className="end-bar">
        <span className="end-title">{heading}</span>
        <button onClick={() => setMinimized(false)}>Sonuçlar</button>
        {nextButton}
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="modal">
        <h2>{heading}</h2>
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
          {nextButton}
          <button onClick={() => setMinimized(true)}>Masayı Gör</button>
          <button onClick={onLeave}>Kalk</button>
        </div>
      </div>
    </div>
  );
}
