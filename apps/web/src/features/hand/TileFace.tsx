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
 * - `mark`：识别没把握，建议核对。用强调色角标而不是错误色 —— 它不是错误，只是提醒眼睛往这儿看。
 */
export function TileFace({
  tile,
  size = "md",
  selected = false,
  dim = false,
  rotated = false,
  back = false,
  mark = false,
  onClick,
  className,
  buttonClassName,
}: {
  tile: Tile;
  size?: TileSize;
  selected?: boolean;
  dim?: boolean;
  rotated?: boolean;
  back?: boolean;
  mark?: boolean;
  onClick?: (() => void) | undefined;
  className?: string;
  /** 可点时按钮本身的额外样式（如键盘把点击区撑满格子，牌图居中） */
  buttonClassName?: string;
}) {
  const { w, h } = TILE_PX[size];
  const label = back ? "牌背" : tileLabel(tile);
  const badge = mark ? (
    <span
      className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-1 ring-surface"
      aria-hidden
    />
  ) : null;
  // 横置：外框固定为 h×w，图片本体绕左上角旋转 90° 再平移进框；不依赖 preflight 的 img max-width
  const rotation = rotated
    ? { transform: "rotate(90deg) translateY(-100%)", transformOrigin: "top left" }
    : {};
  const face = back ? (
    <span
      className="block rounded-[3px] border border-slate-600 bg-slate-500 shadow-sm"
      style={{ width: w, height: h, ...rotation }}
      aria-hidden
    />
  ) : (
    <img
      src={tileUrl(tile)}
      alt=""
      draggable={false}
      className={cn(
        "block max-w-none rounded-[3px] shadow-sm",
        selected && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
      )}
      style={{ width: w, height: h, ...rotation }}
    />
  );
  const body = rotated ? (
    <span className="block shrink-0" style={{ width: h, height: w }} aria-hidden>
      {face}
    </span>
  ) : (
    face
  );
  // 角标绝对定位，所以容器加 relative；不新包一层，免得破坏与副露牌的基线对齐（smoke 有断言）
  const box = cn("relative inline-flex shrink-0 items-end", dim && "opacity-35", className);
  if (!onClick) {
    return (
      <span className={box} role="img" aria-label={label} data-mark={mark || undefined}>
        {body}
        {badge}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      // inline-flex：按钮不再生成行盒，图片底边与不可点击的牌（span）严格同基线
      className={cn(
        "inline-flex rounded-[3px] transition-transform active:scale-95",
        buttonClassName,
      )}
      aria-label={label}
      aria-pressed={selected}
      disabled={dim}
      data-mark={mark || undefined}
    >
      <span className={box}>
        {body}
        {badge}
      </span>
    </button>
  );
}
