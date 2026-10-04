import { face, Face, isJoker } from "@/lib/okey/tiles";

const COLOR_CLASS = ["red", "black", "blue", "yellow", "fake"];

interface Props {
  id: number;
  okey?: Face | null;
  small?: boolean;
  selected?: boolean;
  fresh?: boolean;
  dim?: boolean;
}

export function Tile({ id, okey, small, selected, fresh, dim }: Props) {
  const f = face(id);
  const joker = okey ? isJoker(id, okey) : false;
  const cls = ["tile", COLOR_CLASS[f.color], small && "small", selected && "selected", fresh && "fresh", dim && "dim"]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} data-tile={id}>
      <span className="num">{f.num || "★"}</span>
      <span className="dot" />
      {joker && <span className="joker">OK</span>}
    </div>
  );
}

export function TileBack({ small }: { small?: boolean }) {
  return <div className={small ? "tile back small" : "tile back"} />;
}
