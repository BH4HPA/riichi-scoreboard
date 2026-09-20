import { useState } from "react";
import type { TenStage, Tile } from "@riichi/core";
import { cn } from "@/lib/utils";
import { TileGrid } from "@/features/hand/TileGrid";
import { useCommand } from "@/ws/useRoom";

type StageB = Extract<TenStage, { kind: "B" }>;

/**
 * Stage B 的全牌型板：34 种牌一屏摆开，帮防守方排除——点一下划掉，再点一下恢复（乐观更新，点了就变）。
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
  // 乐观更新：点下去立刻划掉 / 恢复，不等服务器回包。服务端先广播新状态、再回 ack，
  // 所以 ack 到达时权威状态已经在手里了——这时撤掉本地的覆盖值，成功不会闪、失败（提示已弹）自动回到原样。
  const [pending, setPending] = useState<ReadonlyMap<Tile, boolean>>(new Map());
  const marked = new Set(stage.marked);
  for (const [tile, on] of pending) {
    if (on) marked.add(tile);
    else marked.delete(tile);
  }
  const toggle = async (tile: Tile) => {
    const on = !marked.has(tile);
    setPending((prev) => new Map(prev).set(tile, on));
    await send({ type: "tenMark", tile, on, entries });
    setPending((prev) => {
      // 期间又点了同一张：那一下有它自己的收尾
      if (prev.get(tile) !== on) return prev;
      const next = new Map(prev);
      next.delete(tile);
      return next;
    });
  };

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
        onPick={pickable ? (tile) => void toggle(tile) : undefined}
        className={tv ? "gap-1.5" : undefined}
        testId="guess-tiles"
      />
    </section>
  );
}
