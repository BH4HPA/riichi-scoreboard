import { useState } from "react";
import { tenDeclareLabel, type TenStage, type Tile } from "@riichi/core";
import { Button } from "@/ui/button";
import { cn } from "@/lib/utils";
import { TileGrid } from "@/features/hand/TileGrid";
import type { TileSize } from "@/features/hand/tileSize";
import { useCommand } from "@/ws/useRoom";

type StageB = Extract<TenStage, { kind: "B" }>;

/**
 * Stage B 的全牌型板：34 种牌一屏摆开，帮防守方排除。往轮指定过的变暗并划掉；最近一轮的两张带角标、不变暗
 * （进攻方还在回答，同桌的人要看得清刚才点的是哪两张），下一轮指定后它们也变暗；正在选的两张是选中态。
 * `pickable`（见 `canPickFor`）：可以在上面点两张再「指定」；否则只读。
 * 指定过的牌不能再点（服务端同样拒绝：重复猜没有意义）。是否命中由进攻方口头回答。
 */
export function GuessBoard({
  stage,
  names,
  pickable,
  size = "sm",
  className,
}: {
  stage: StageB;
  names: string[];
  pickable: boolean;
  size?: TileSize;
  className?: string;
}) {
  const send = useCommand();
  const [chosen, setChosen] = useState<Tile[]>([]);
  const [busy, setBusy] = useState(false);
  const last: readonly Tile[] = stage.guesses[stage.guesses.length - 1] ?? [];
  const earlier = new Set(stage.guesses.slice(0, -1).flat());
  const guessed = new Set(stage.guesses.flat());
  // 我还在选的时候别人先提交了一轮：其中已经指定过的不再算我选中的
  const picked = chosen.filter((t) => !guessed.has(t));
  const round = stage.guesses.length + 1;

  const toggle = (tile: Tile) => {
    setChosen(
      picked.includes(tile) ? picked.filter((t) => t !== tile) : [...picked, tile].slice(-2),
    );
  };
  const confirm = async () => {
    const [a, b] = picked;
    if (a === undefined || b === undefined) return;
    setBusy(true);
    const ok = await send({ type: "tenGuess", tiles: [a, b] });
    setBusy(false);
    if (ok) setChosen([]);
  };

  return (
    <section className={cn("flex flex-col gap-3", className)} data-testid="guess-board">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className={cn("font-semibold", size === "sm" ? "text-base" : "text-xl")}>
          第 {round} 轮指定
        </h2>
        <span className="text-sm text-muted">
          进攻方 {names[stage.attacker]}（{tenDeclareLabel(stage.riichi)}）· 已指定{" "}
          {stage.guesses.length} 轮
        </span>
      </header>
      <TileGrid
        aka={false}
        size={size}
        // 只读时刚指定的两张保持明亮；可选时它们同样不能再点，所以一并按下去
        disabled={(t) => (pickable ? guessed.has(t) : earlier.has(t))}
        struck={(t) => earlier.has(t)}
        marked={(t) => last.includes(t)}
        selected={(t) => picked.includes(t)}
        onPick={pickable ? toggle : undefined}
        // 格子里的牌靠左不拉伸：划线按牌面的宽度画，不会伸到格子的空白里
        className={cn("grid grid-cols-9 justify-items-start", size === "sm" ? "gap-1" : "gap-2")}
        testId="guess-tiles"
      />
      {pickable ? (
        <div className="flex items-center gap-3">
          <Button variant="accent" disabled={picked.length !== 2 || busy} onClick={confirm}>
            指定这两张
          </Button>
          <span className="text-xs text-muted">
            {picked.length === 2
              ? "确认后问进攻方：听的牌里有没有这两张"
              : `再选 ${2 - picked.length} 张；划掉的和带角标的都已经指定过`}
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted">
          由防守方在手机上指定。带角标的是刚指定的两张，划掉的是之前指定过的。
        </p>
      )}
    </section>
  );
}
