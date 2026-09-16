import type { HandInput } from "@riichi/core";
import { cn } from "@/lib/utils";
import { HandStrip, IndicatorRow } from "./HandStrip";
import type { TileSize } from "./TileFace";
import type { TileLoc } from "./tileLoc";

/**
 * 一手牌的完整展示：暗牌 + 和张 + 副露，下面跟宝牌 / 里宝指示牌。
 * 结算确认态与取景框的实时预览共用这一份 —— 同一个信息在时间轴两端的两次呈现，
 * 不该长成两个组件。传了 `onTileClick` 就可点，没传就是纯展示。
 */
export function HandView({
  hand,
  size = "md",
  marks,
  onTileClick,
  showUra = true,
  keepEmptyDora = false,
  onAddDora,
  className,
}: {
  hand: HandInput;
  size?: TileSize;
  marks?: readonly TileLoc[] | undefined;
  onTileClick?: ((loc: TileLoc) => void) | undefined;
  showUra?: boolean;
  /** 确认态：一张宝牌指示牌都没认出来时也要留个空位，否则缺口看不见 */
  keepEmptyDora?: boolean;
  onAddDora?: (() => void) | undefined;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <HandStrip
        closed={hand.closed}
        melds={hand.melds}
        winTile={hand.winTile > 0 ? hand.winTile : null}
        size={size}
        marks={marks}
        onTileClick={onTileClick}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <IndicatorRow
          label="宝牌指示"
          tiles={hand.doraIndicators}
          area="dora"
          marks={marks}
          onTileClick={onTileClick}
          keepEmpty={keepEmptyDora}
          onAdd={onAddDora}
        />
        {showUra && (
          <IndicatorRow
            label="里宝指示"
            tiles={hand.uraIndicators}
            area="ura"
            marks={marks}
            onTileClick={onTileClick}
          />
        )}
      </div>
    </div>
  );
}
