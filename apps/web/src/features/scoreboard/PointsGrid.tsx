import { Crown } from "lucide-react";
import {
  computeRanks,
  formatDiff,
  formatPoints,
  SEATS,
  WIND_LABELS,
  seatWind,
  type GameState,
  type PlayerRef,
  type RoomRules,
} from "@riichi/core";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/controls";
import { cn } from "@/lib/utils";

function rankTone(rank: number, ranks: number[]): "pos" | "neg" | "neutral" {
  const best = Math.min(...ranks);
  const worst = Math.max(...ranks);
  if (rank === best) return "pos";
  if (rank === worst && worst !== best) return "neg";
  return "neutral";
}

export function PointsGrid({
  game,
  seats,
  names,
  rules,
  tv = false,
  highlightSeat = null,
}: {
  game: GameState;
  seats: (PlayerRef | null)[];
  names: string[];
  rules: RoomRules;
  tv?: boolean;
  highlightSeat?: number | null;
}) {
  const ranks = computeRanks(game.points, rules.final.tieRule);
  return (
    <div className={cn("grid grid-cols-2 gap-2", tv && "gap-3")}>
      {SEATS.map((seat) => {
        const isDealer = seat === game.dealer && game.status !== "finished";
        const tone = rankTone(ranks[seat]!, ranks);
        return (
          <div
            key={seat}
            className={cn(
              "relative rounded-xl border bg-surface p-3",
              isDealer ? "border-accent" : "border-border",
              highlightSeat === seat && "ring-2 ring-accent/60",
              tv && "p-4",
            )}
          >
            {isDealer && <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl bg-accent" />}
            <div className="flex items-center gap-2">
              <Avatar
                name={names[seat]!}
                src={seats[seat]?.avatar ?? null}
                size={tv ? "lg" : "md"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <span>{WIND_LABELS[seatWind(seat, game.dealer)]}</span>
                  <span className={cn("truncate text-fg", tv ? "text-lg" : "text-sm")}>
                    {names[seat]}
                  </span>
                </div>
              </div>
              {isDealer && (
                <Badge tone="accent">
                  <Crown className="h-3 w-3" /> 庄家
                </Badge>
              )}
            </div>
            <div className={cn("mt-2 flex items-end justify-between gap-2")}>
              <span
                className={cn("font-semibold tabular leading-none", tv ? "text-5xl" : "text-2xl")}
              >
                <span data-testid={`points-${seat}`}>{formatPoints(game.points[seat]!)}</span>
              </span>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={tone}>第 {ranks[seat]} 名</Badge>
                <span
                  className={cn(
                    "text-xs tabular",
                    game.points[seat]! - rules.final.startPoints >= 0 ? "text-pos" : "text-neg",
                  )}
                >
                  {formatDiff(game.points[seat]! - rules.final.startPoints)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
