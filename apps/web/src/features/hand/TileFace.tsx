import type { Tile } from "@riichi/core";
import { cn } from "@/lib/utils";
import { tileAssetName, tileLabel } from "./tileLabel";
import { TILE_PX, type TileSize } from "./tileSize";

const ASSETS = import.meta.glob("../../assets/tiles/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function tileUrl(tile: Tile): string {
  return ASSETS[`../../assets/tiles/${tileAssetName(tile)}.svg`] ?? "";
}

export type { TileSize } from "./tileSize";

/**
 * 单张牌：`<img>` 引用扁平风格 SVG。
 * - `back`：牌背（暗杠首尾）；`rotated`：横置（副露叫牌）；`selected`：和张/当前选中；`dim`：不可选。
 */
export function TileFace({
  tile,
  size = "md",
  selected = false,
  dim = false,
  rotated = false,
  back = false,
  onClick,
  className,
}: {
  tile: Tile;
  size?: TileSize;
  selected?: boolean;
  dim?: boolean;
  rotated?: boolean;
  back?: boolean;
  onClick?: (() => void) | undefined;
  className?: string;
}) {
  const { w, h } = TILE_PX[size];
  const label = back ? "牌背" : tileLabel(tile);
  const face = back ? (
    <span
      className="block rounded-[3px] border border-slate-600 bg-slate-500 shadow-sm"
      style={{ width: w, height: h }}
      aria-hidden
    />
  ) : (
    <img
      src={tileUrl(tile)}
      alt=""
      draggable={false}
      className={cn(
        "block rounded-[3px] shadow-sm",
        selected && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
      )}
      style={{ width: w, height: h }}
    />
  );
  const body = rotated ? (
    <span className="relative inline-block" style={{ width: h, height: w }} aria-hidden>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90">
        {face}
      </span>
    </span>
  ) : (
    face
  );
  const wrapped = (
    <span
      className={cn("inline-flex shrink-0 items-end", dim && "opacity-35", className)}
      role="img"
      aria-label={label}
    >
      {body}
    </span>
  );
  if (!onClick) return wrapped;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[3px] transition-transform active:scale-95"
      aria-label={label}
      aria-pressed={selected}
      disabled={dim}
    >
      <span className={cn("inline-flex shrink-0 items-end", dim && "opacity-35", className)}>
        {body}
      </span>
    </button>
  );
}
