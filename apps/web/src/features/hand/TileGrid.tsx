import { AKA_TILES, ALL_TILES, type Tile } from "@riichi/core";
import { TileFace } from "./TileFace";
import type { TileSize } from "./tileSize";

/**
 * 全部牌面的 9 列网格（万筒索各一行、字牌一行），启用赤五时在末尾补一行三张赤五。
 * 键盘录入与确认态的替换面板共用；不传 `onPick` 即只读（二人房电视上的全牌型板），牌不渲染成按钮。
 */
export function TileGrid({
  aka,
  disabled,
  selected,
  marked,
  struck,
  onPick,
  size = "sm",
  buttonClassName,
  className,
  testId,
}: {
  aka: boolean;
  disabled: (tile: Tile) => boolean;
  selected?: (tile: Tile) => boolean;
  /** 角标（强调色圆点）：提醒眼睛往这儿看 */
  marked?: (tile: Tile) => boolean;
  /** 划掉（已排除） */
  struck?: (tile: Tile) => boolean;
  onPick?: ((tile: Tile) => void) | undefined;
  size?: TileSize;
  /** 点击区样式：键盘把点击区撑到整格，牌图保持原尺寸居中 */
  buttonClassName?: string;
  className?: string;
  testId?: string;
}) {
  const face = (t: Tile) => (
    <TileFace
      key={t}
      tile={t}
      size={size}
      selected={selected?.(t) ?? false}
      mark={marked?.(t) ?? false}
      struck={struck?.(t) ?? false}
      dim={disabled(t)}
      onClick={onPick ? () => onPick(t) : undefined}
      {...(buttonClassName ? { buttonClassName } : {})}
    />
  );
  return (
    <div className={className ?? "grid grid-cols-9 gap-1"} data-testid={testId}>
      {ALL_TILES.map(face)}
      {aka && (
        <>
          <span className="col-span-2" aria-hidden />
          {AKA_TILES.map(face)}
        </>
      )}
    </div>
  );
}
