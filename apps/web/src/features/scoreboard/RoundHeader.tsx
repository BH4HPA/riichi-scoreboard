import { Clock3, Timer } from "lucide-react";
import { dealerOf, formatPoints, roundLabel, type GameState, type RoomRules } from "@riichi/core";
import { Badge } from "@/ui/controls";
import { cn, formatClock } from "@/lib/utils";
import { useNow } from "./useNow";

export function RoundHeader({
  game,
  names,
  rules,
  tv = false,
}: {
  game: GameState;
  names: string[];
  rules: RoomRules;
  tv?: boolean;
}) {
  const now = useNow();
  const elapsed = Math.max(
    0,
    Math.floor(((game.finishedAt ?? now.getTime()) - game.startedAt) / 60000),
  );
  const total = game.points.reduce((a, b) => a + b, 0);
  const expected = rules.final.startPoints * 4;
  /** 桌上的棒：立直棒 + 本场棒（沿用旧版「场供」口径） */
  const tableSticks = game.kyotaku * 1000 + game.honba * rules.scoring.honbaValue;
  const label = game.status === "finished" ? "对局结束" : roundLabel(game.kyoku, game.honba);
  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", tv ? "text-base" : "text-sm")}
    >
      <div className="flex items-center gap-2">
        <span className={cn("font-semibold tabular", tv ? "text-3xl" : "text-lg")}>{label}</span>
        {game.status !== "finished" && (
          <Badge tone="accent" className={tv ? "text-sm" : ""}>
            庄家：{names[dealerOf(game.kyoku)]}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-muted">
        <span>场供</span>
        <span className={cn("font-semibold tabular text-fg", tv && "text-xl")}>
          {formatPoints(tableSticks)}
        </span>
        <span>点</span>
        <Badge tone="outline">{game.kyotaku} 棒</Badge>
        <Badge tone="outline">{game.honba} 本场</Badge>
      </div>
      <div className="ml-auto flex items-center gap-4 text-muted">
        <span className="flex items-center gap-1">
          <Clock3 className="h-4 w-4 text-sky-500" />
          <span className="tabular text-fg">{formatClock(now)}</span>
        </span>
        <span className="flex items-center gap-1">
          <Timer className="h-4 w-4 text-pos" />
          <span className="tabular text-fg">{elapsed}</span> 分钟
        </span>
        <span className={cn("tabular", total === expected ? "text-pos" : "text-neg")}>
          {formatPoints(total)} / {formatPoints(expected)}
        </span>
      </div>
    </div>
  );
}
