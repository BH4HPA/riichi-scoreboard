import { tenDeclareLabel, tenRoundLabel, type TenGameState, type TenTimeMark } from "@riichi/core";
import { Badge } from "@/ui/controls";
import { cn } from "@/lib/utils";
import { TimeBadge } from "../clock/TimeBadge";

/** 二人房页头：第几局 · 本场、当前阶段（Stage B 写明谁在进攻、宣言的是什么）、计时档位。 */
export function TenHeader({
  game,
  names,
  timeMark,
  tv = false,
}: {
  game: TenGameState;
  names: string[];
  timeMark: TenTimeMark;
  tv?: boolean;
}) {
  const { stage } = game;
  const finished = game.status === "finished";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <h1 className={cn("font-semibold tabular", tv ? "text-3xl" : "text-xl")}>
        {finished ? "对局结束" : tenRoundLabel(game.round, game.honba)}
      </h1>
      {!finished && (
        <Badge
          tone={stage.kind === "B" ? "accent" : "outline"}
          size={tv ? "md" : "sm"}
          data-testid="ten-stage"
        >
          {stage.kind === "A"
            ? "Stage A · 比谁先听牌"
            : `Stage B · ${names[stage.attacker]} ${tenDeclareLabel(stage.riichi)}`}
        </Badge>
      )}
      {!finished && (
        <span className={cn("text-muted", tv ? "text-base" : "text-xs")}>
          庄家 {names[game.dealer]}
        </span>
      )}
      <TimeBadge mark={timeMark} tv={tv} />
    </div>
  );
}
