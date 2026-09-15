import { tileOrder, type Meld, type Tile } from "@riichi/core";
import { cn } from "@/lib/utils";
import { TileFace, type TileSize } from "./TileFace";

/**
 * 手牌展示：暗牌按牌序、和张右置留空隙、副露成组（明副露首张横置，暗杠首尾牌背）。
 * wrap=false 时不换行，由调用方提供横向滚动容器（手机番符表）。
 */
export function HandStrip({
  closed,
  melds,
  winTile = null,
  size = "sm",
  wrap = true,
  className,
}: {
  closed: readonly Tile[];
  melds: readonly Meld[];
  /** 和张（精确码）；null 表示不单独标出 */
  winTile?: Tile | null;
  size?: TileSize;
  wrap?: boolean;
  className?: string;
}) {
  const rest = [...closed];
  if (winTile !== null) {
    const idx = rest.lastIndexOf(winTile);
    if (idx !== -1) rest.splice(idx, 1);
  }
  rest.sort((a, b) => tileOrder(a) - tileOrder(b));
  return (
    <div
      className={cn(
        "flex items-end gap-x-3 gap-y-1",
        wrap ? "flex-wrap" : "w-max flex-nowrap",
        className,
      )}
    >
      <div className="flex items-end gap-px">
        {rest.map((t, i) => (
          <TileFace key={i} tile={t} size={size} />
        ))}
      </div>
      {winTile !== null && rest.length !== closed.length && (
        <TileFace tile={winTile} size={size} selected />
      )}
      {melds.map((m, i) => (
        <MeldGroup key={i} meld={m} size={size} />
      ))}
    </div>
  );
}

function MeldGroup({ meld, size }: { meld: Meld; size: TileSize }) {
  const ankan = !meld.open && meld.tiles.length === 4;
  const last = meld.tiles.length - 1;
  return (
    <div className="flex items-end gap-px" role="group" aria-label={ankan ? "暗杠" : "副露"}>
      {meld.tiles.map((t, j) => (
        <TileFace
          key={j}
          tile={t}
          size={size}
          back={ankan && (j === 0 || j === last)}
          rotated={meld.open && j === 0}
        />
      ))}
    </div>
  );
}

/** 宝牌 / 里宝指示牌一行。 */
export function IndicatorRow({
  label,
  tiles,
  size = "xs",
}: {
  label: string;
  tiles: readonly Tile[];
  size?: TileSize;
}) {
  if (tiles.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted">
      <span>{label}</span>
      <div className="flex items-end gap-px">
        {tiles.map((t, i) => (
          <TileFace key={i} tile={t} size={size} />
        ))}
      </div>
    </div>
  );
}
