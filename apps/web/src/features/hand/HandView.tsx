import { useEffect, useRef, useState } from "react";
import type { RecognizedHand } from "@riichi/core";
import { cn } from "@/lib/utils";
import { HandStrip, IndicatorRow } from "./HandStrip";
import type { TileSize } from "./TileFace";
import type { TileLoc } from "./tileLoc";

/**
 * 一手牌的完整展示：暗牌 + 和张 + 副露，下面跟宝牌 / 里宝指示牌。
 * 结算确认态与取景框的实时预览共用；传了 `onTileClick` 就可点，没传就是纯展示。
 */
export function HandView({
  hand,
  size = "md",
  marks,
  onTileClick,
  showUra = true,
  scroll = false,
  keepEmptyDora = false,
  onAddDora,
  indicatorClassName,
  className,
}: {
  /** 只要牌，不要旗标：结算草稿与取景框的实时结果都能直接传进来 */
  hand: RecognizedHand;
  size?: TileSize;
  marks?: readonly TileLoc[] | undefined;
  onTileClick?: ((loc: TileLoc) => void) | undefined;
  showUra?: boolean;
  /**
   * 手牌不换行，超出部分横滑。手机上 14 张大牌放不下一行，换行会把和张单独甩到第二行，
   * 跟暗牌断开——那正是最该和暗牌挨着看的一张。
   */
  scroll?: boolean;
  /** 确认态：一张宝牌指示牌都没认出来时也要留个空位，否则缺口看不见 */
  keepEmptyDora?: boolean;
  onAddDora?: (() => void) | undefined;
  /** 指示牌行的样式（深色底上把标签调亮） */
  indicatorClassName?: string;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  // 牌变了、容器宽度变了都要重新量：牌越多越会溢出，副露多的手牌反而可能放得下
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollWidth - el.clientWidth > 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hand, size, scroll]);

  return (
    <div className={cn("space-y-2", className)}>
      {/* 横滑时右侧渐隐：和张与副露在最右端，不给提示用户会以为牌就这些。
          负边距要挂在外层：挂在滚动容器上的话它比外层宽 4px，渐变停在外层右沿，
          最右那 4px 内容（正好是和张的描边）会从渐变里探出来，看着就是没对齐。 */}
      <div className={scroll ? "relative -mx-1" : undefined}>
        <div ref={scrollRef} className={scroll ? "overflow-x-auto px-1" : undefined}>
          <HandStrip
            closed={hand.closed}
            melds={hand.melds}
            winTile={hand.winTile > 0 ? hand.winTile : null}
            size={size}
            wrap={!scroll}
            marks={marks}
            onTileClick={onTileClick}
          />
        </div>
        {/* 放得下就不画：否则渐变会白白把最后一张牌压暗，看着像渲染坏了 */}
        {scroll && overflowing && (
          <span
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-surface to-transparent"
            aria-hidden
          />
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <IndicatorRow
          label="宝牌指示"
          tiles={hand.doraIndicators}
          area="dora"
          marks={marks}
          onTileClick={onTileClick}
          keepEmpty={keepEmptyDora}
          onAdd={onAddDora}
          className={indicatorClassName}
        />
        {showUra && (
          <IndicatorRow
            label="里宝指示"
            tiles={hand.uraIndicators}
            area="ura"
            marks={marks}
            onTileClick={onTileClick}
            className={indicatorClassName}
          />
        )}
      </div>
    </div>
  );
}
