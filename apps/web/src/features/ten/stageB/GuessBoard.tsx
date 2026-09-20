import type { TenStage, Tile } from "@riichi/core";
import { cn } from "@/lib/utils";
import { TileGrid } from "@/features/hand/TileGrid";
import { useCommand } from "@/ws/useRoom";

type StageB = Extract<TenStage, { kind: "B" }>;

/**
 * Stage B 的全牌型板：34 种牌一屏摆开，帮防守方排除——点一下划掉，再点一下恢复。
 * 它不管猜牌的流程（第几轮、每轮几张、是否命中都在牌桌上口头进行）。
 * 与牌键盘同一个网格：牌撑满格子，电视上随栏宽放大。`pickable` 见 `canPickFor`，否则只读。
 */
export function GuessBoard({
  stage,
  entries,
  pickable,
  tv = false,
}: {
  stage: StageB;
  /** 当前的历史条数：划牌命令带着它，落不到别的局上 */
  entries: number;
  pickable: boolean;
  tv?: boolean;
}) {
  const send = useCommand();
  const marked = new Set(stage.marked);
  const toggle = (tile: Tile) =>
    void send({ type: "tenMark", tile, on: !marked.has(tile), entries });

  return (
    <section className="flex flex-col gap-2" data-testid="guess-board">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className={cn("font-semibold", tv ? "text-xl" : "text-sm")}>全牌型</h2>
        <span className={cn("text-muted", tv ? "text-base" : "text-xs")}>
          {pickable ? "点一下划掉，再点恢复" : `已划掉 ${marked.size} 种`}
        </span>
      </header>
      <TileGrid
        aka={false}
        struck={(t) => marked.has(t)}
        onPick={pickable ? toggle : undefined}
        className={tv ? "gap-1.5" : undefined}
        testId="guess-tiles"
      />
    </section>
  );
}
