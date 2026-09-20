import type { Tile } from "@riichi/core";
import { cn } from "@/lib/utils";
import { tileUrl } from "./tileAsset";
import { tileLabel } from "./tileLabel";

/** 只变暗的话白板几乎看不见，像缺了一张牌：划掉的再画一道斜线 */
const STRIKE =
  "pointer-events-none absolute inset-0 bg-[linear-gradient(to_top_right,transparent_46%,currentColor_46%,currentColor_54%,transparent_54%)] text-fg";

/**
 * 用来点选的一张牌：牌面撑满所在的格子（比例由 SVG 自己保持），整张牌都是点按区。
 * 与 `TileFace`（按固定像素摆牌、要和副露的横置牌对齐基线）不同，它只活在等宽的网格里：
 * 牌尽量大、横竖间距一致，单手点选不用对准、不容易点到隔壁。
 * - `dim`：不可选（按钮禁用）；`selected`：当前选中；`struck`：划掉，仍可点（再点一下恢复）。
 * - 不传 `onClick` 即只读，不渲染成按钮。
 */
export function TileKey({
  tile,
  dim = false,
  selected = false,
  struck = false,
  onClick,
}: {
  tile: Tile;
  dim?: boolean;
  selected?: boolean;
  struck?: boolean;
  onClick?: (() => void) | undefined;
}) {
  const label = tileLabel(tile);
  const face = (
    <>
      {/* width / height 只用来告诉浏览器宽高比（SVG viewBox 19:26）：图片还没到就先占好位置，首次打开不会整排塌掉再跳出来 */}
      <img
        src={tileUrl(tile)}
        alt=""
        width={19}
        height={26}
        draggable={false}
        className={cn(
          "block h-auto w-full rounded-[4px] shadow-sm",
          (dim || struck) && "opacity-35",
          selected && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
        )}
      />
      {struck && <span className={STRIKE} aria-hidden />}
    </>
  );
  if (!onClick) {
    return (
      <span
        role="img"
        aria-label={label}
        data-struck={struck || undefined}
        className="relative block"
      >
        {face}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected || struck}
      disabled={dim}
      className="relative block rounded-[4px] transition-transform active:scale-95"
    >
      {face}
    </button>
  );
}
