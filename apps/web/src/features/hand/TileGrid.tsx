import { AKA_TILES, ALL_TILES, type Tile } from "@riichi/core";
import { TileFace } from "./TileFace";

/**
 * 全部牌面的 9 列网格（万筒索各一行、字牌一行），启用赤五时在末尾补一行三张赤五。
 * 键盘录入与确认态的替换面板共用。
 */
export function TileGrid({
  aka,
  disabled,
  selected,
  onPick,
  buttonClassName,
  className,
  testId,
}: {
  aka: boolean;
  disabled: (tile: Tile) => boolean;
  selected?: (tile: Tile) => boolean;
  onPick: (tile: Tile) => void;
  /** 点击区样式：键盘把点击区撑到整格，牌图保持原尺寸居中 */
  buttonClassName?: string;
  className?: string;
  testId?: string;
}) {
  const face = (t: Tile) => (
    <TileFace
      key={t}
      tile={t}
      size="sm"
      selected={selected?.(t) ?? false}
      dim={disabled(t)}
      onClick={() => onPick(t)}
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
