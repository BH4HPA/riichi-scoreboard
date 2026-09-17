import {
  computeRanks,
  dealerOf,
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

/** 三档密度：手机（默认）、Pad 单栏主控台、宽屏电视。 */
export type ScoreSize = "phone" | "pad" | "tv";

const STYLE = {
  phone: {
    gap: "gap-2",
    card: "p-3",
    avatar: "md",
    name: "text-sm",
    badge: "sm",
    points: "text-2xl",
  },
  pad: {
    gap: "gap-3",
    card: "p-4",
    avatar: "lg",
    name: "text-lg",
    badge: "md",
    points: "text-4xl",
  },
  tv: { gap: "gap-3", card: "p-4", avatar: "lg", name: "text-xl", badge: "md", points: "text-5xl" },
} as const;

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
  size = "phone",
  mySeat = null,
}: {
  game: GameState;
  seats: (PlayerRef | null)[];
  names: string[];
  rules: RoomRules;
  size?: ScoreSize;
  /** 手机端自己的座位：名字后标「我」 */
  mySeat?: number | null;
}) {
  const ranks = computeRanks(game.points, rules.final.tieRule);
  const dealer = dealerOf(game.kyoku);
  const st = STYLE[size];
  const phone = size === "phone";
  return (
    <div className={cn("grid grid-cols-2", st.gap)}>
      {SEATS.map((seat) => {
        const isDealer = seat === dealer && game.status !== "finished";
        const tone = rankTone(ranks[seat]!, ranks);
        // 庄家标记并进自风：庄家的自风必然是东，把它做成实底即可
        const wind = (
          <Badge
            tone={isDealer ? "accent" : "outline"}
            size={st.badge}
            className="shrink-0"
            {...(isDealer ? { "aria-label": "东（庄家）" } : {})}
          >
            {WIND_LABELS[seatWind(seat, dealer)]}
          </Badge>
        );
        const rank = (
          <Badge tone={tone} size={st.badge} className="shrink-0 whitespace-nowrap">
            第 {ranks[seat]} 名
          </Badge>
        );
        return (
          <div
            key={seat}
            className={cn(
              "relative overflow-hidden rounded-xl border bg-surface",
              st.card,
              isDealer ? "border-accent" : "border-border",
            )}
          >
            {/* 顶条交给卡片的圆角裁切，弧度才能和边框内沿吻合 */}
            {isDealer && <div className="absolute inset-x-0 top-0 h-1 bg-accent" />}
            <div className="flex items-center gap-2">
              <Avatar name={names[seat]!} src={seats[seat]?.avatar ?? null} size={st.avatar} />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className={cn("truncate font-medium", st.name)}>{names[seat]}</span>
                {phone && mySeat === seat && (
                  <Badge tone="neutral" size="sm" className="shrink-0">
                    我
                  </Badge>
                )}
              </div>
              {!phone && wind}
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className={cn("font-semibold tabular leading-none", st.points)}>
                <span data-testid={`points-${seat}`}>{formatPoints(game.points[seat]!)}</span>
              </span>
              {phone ? (
                // 手机卡片窄：风位（庄家为实底）挪到分数行，让第一行完整放下昵称
                <span className="flex flex-col items-end gap-1">
                  {wind}
                  {rank}
                </span>
              ) : (
                rank
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
