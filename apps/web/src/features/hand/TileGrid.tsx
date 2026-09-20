import { AKA_TILES, ALL_TILES, type Tile } from "@riichi/core";
import { cn } from "@/lib/utils";
import { TileKey } from "./TileKey";

/**
 * 全部牌面的 9 列网格（万筒索各一行、字牌一行），启用赤五时在末尾补一行三张赤五。
 * 键盘录入、确认态的替换面板与二人房的全牌型板共用：牌撑满格子（见 `TileKey`），随容器宽度放大。
 * 不传 `onPick` 即只读。
 */
export function TileGrid({
  aka,
  disabled,
  selected,
  struck,
  onPick,
  className,
  testId,
}: {
  aka: boolean;
  disabled?: (tile: Tile) => boolean;
  selected?: (tile: Tile) => boolean;
  /** 划掉（仍可点） */
  struck?: (tile: Tile) => boolean;
  onPick?: ((tile: Tile) => void) | undefined;
  className?: string | undefined;
  testId?: string;
}) {
  const key = (t: Tile) => (
    <TileKey
      key={t}
      tile={t}
      dim={disabled?.(t) ?? false}
      selected={selected?.(t) ?? false}
      struck={struck?.(t) ?? false}
      onClick={onPick ? () => onPick(t) : undefined}
    />
  );
  return (
    <div className={cn("grid grid-cols-9 gap-1", className)} data-testid={testId}>
      {ALL_TILES.map(key)}
      {aka && (
        <>
          <span className="col-span-2" aria-hidden />
          {AKA_TILES.map(key)}
        </>
      )}
    </div>
  );
}
