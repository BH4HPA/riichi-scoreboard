import { formatPoints, type PlayerRef, type TenGameState } from "@riichi/core";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/controls";
import { cn } from "@/lib/utils";
import type { ScoreSize } from "@/features/scoreboard/PointsGrid";

const STYLE = {
  phone: {
    gap: "gap-2",
    card: "p-3",
    avatar: "md",
    name: "text-sm",
    badge: "sm",
    score: "text-2xl",
  },
  pad: { gap: "gap-3", card: "p-4", avatar: "lg", name: "text-lg", badge: "md", score: "text-4xl" },
  tv: { gap: "gap-3", card: "p-5", avatar: "lg", name: "text-xl", badge: "md", score: "text-6xl" },
} as const;

/**
 * 两家的得分卡：各自累计得分（没有点棒往来，所以没有点差 / 顺位那一套）、自风（庄家东、闲家西）、
 * 剩余立直棒。Stage B 时进攻方 / 防守方各标一枚徽标。
 */
export function TenScoreGrid({
  game,
  seats,
  names,
  size = "phone",
  mySeat = null,
}: {
  game: TenGameState;
  seats: (PlayerRef | null)[];
  names: string[];
  size?: ScoreSize;
  mySeat?: number | null;
}) {
  const st = STYLE[size];
  const finished = game.status === "finished";
  const { stage } = game;
  return (
    <div className={cn("grid grid-cols-2", st.gap)}>
      {game.scores.map((score, seat) => {
        const isDealer = seat === game.dealer && !finished;
        const role =
          finished || stage.kind === "A" ? null : stage.attacker === seat ? "进攻" : "防守";
        const winner = finished && game.final?.winner === seat;
        return (
          <div
            key={seat}
            className={cn(
              "relative overflow-hidden rounded-xl border bg-surface",
              st.card,
              isDealer || winner ? "border-accent" : "border-border",
            )}
          >
            {isDealer && <div className="absolute inset-x-0 top-0 h-1 bg-accent" />}
            <div className="flex items-center gap-2">
              <Avatar name={names[seat]!} src={seats[seat]?.avatar ?? null} size={st.avatar} />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className={cn("truncate font-medium", st.name)}>{names[seat]}</span>
                {mySeat === seat && (
                  <Badge tone="neutral" size="sm" className="shrink-0">
                    我
                  </Badge>
                )}
              </div>
              <Badge
                tone={isDealer ? "accent" : "outline"}
                size={st.badge}
                className="shrink-0"
                {...(isDealer ? { "aria-label": "东（庄家）" } : {})}
              >
                {finished
                  ? winner
                    ? "胜"
                    : game.final?.winner === null
                      ? "平"
                      : "负"
                  : isDealer
                    ? "东"
                    : "西"}
              </Badge>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className={cn("font-semibold tabular leading-none", st.score)}>
                <span data-testid={`score-${seat}`}>{formatPoints(score)}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                {role && (
                  <Badge tone={role === "进攻" ? "accent" : "neutral"} size={st.badge}>
                    {role}
                  </Badge>
                )}
                <span
                  className={cn(
                    "whitespace-nowrap text-muted",
                    size === "phone" ? "text-xs" : "text-sm",
                  )}
                  data-testid={`sticks-${seat}`}
                >
                  立直棒 {game.sticks[seat]}
                </span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
