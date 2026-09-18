import {
  formatPoints,
  formatScore,
  standings,
  umaDescription,
  type GameState,
  type PlayerRef,
  type RoomRules,
} from "@riichi/core";
import { Crown } from "lucide-react";
import { Avatar } from "@/ui/avatar";
import { cn, formatDateTime } from "@/lib/utils";

export function FinalPanel({
  game,
  seats,
  names,
  rules,
  tv = false,
  compact = false,
}: {
  game: GameState;
  seats: (PlayerRef | null)[];
  names: string[];
  rules: RoomRules;
  tv?: boolean;
  /** 手机：每人两行（名次·头像·得分 / 姓名·马点），不排五列表格 */
  compact?: boolean;
}) {
  const final = game.final;
  if (!final) return null;
  const order = standings(final.points);
  const finishedAt = game.finishedAt ?? game.startedAt;
  const meta = (
    <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
      <span>持续时间：{Math.max(0, Math.floor((finishedAt - game.startedAt) / 60000))} 分钟</span>
      <span>结束时间：{formatDateTime(finishedAt)}</span>
      {game.tobi && <span>击飞：{game.tobi.seats.map((s) => names[s]).join("、")}</span>}
    </div>
  );
  if (compact) {
    return (
      <div>
        <ol className="divide-y divide-border">
          {order.map((seat) => {
            const rank = final.ranks[seat]!;
            const score = final.scores[seat]!;
            return (
              <li key={seat} className={cn("py-2", rank === 1 && "font-semibold")}>
                <div className="flex items-center gap-2">
                  <span className="flex w-6 shrink-0 items-center tabular text-lg">
                    {rank === 1 ? <Crown className="h-5 w-5 text-accent" aria-label="1" /> : rank}
                  </span>
                  <Avatar name={names[seat]!} src={seats[seat]?.avatar ?? null} size="sm" />
                  <span
                    className={cn(
                      "ml-auto text-xl font-semibold tabular",
                      score >= 0 ? "text-pos" : "text-neg",
                    )}
                  >
                    {formatScore(score)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 pl-8 text-sm font-normal">
                  <span className="min-w-0 truncate">{names[seat]}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted tabular">
                    马点 {formatScore(final.uma[seat]!)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-1 text-xs text-muted">{umaDescription(rules)}</p>
        {meta}
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs text-muted">{umaDescription(rules)}</p>
      <table className={cn("mt-2 w-full border-collapse", tv ? "text-lg" : "text-sm")}>
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">排名</th>
            <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">玩家</th>
            <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">分数</th>
            <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">马点</th>
            <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">得分</th>
          </tr>
        </thead>
        <tbody>
          {order.map((seat) => {
            const rank = final.ranks[seat]!;
            return (
              <tr
                key={seat}
                className={cn(
                  "border-t border-border",
                  rank === 1 && "bg-pos/10",
                  rank === 4 && "bg-neg/10",
                )}
              >
                <td className="px-2 py-2 tabular">{rank}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={names[seat]!} src={seats[seat]?.avatar ?? null} size="sm" />
                    <span className="truncate">{names[seat]}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular">
                  {formatPoints(final.points[seat]!)}
                </td>
                <td className="px-2 py-2 text-right tabular text-muted">
                  {formatScore(final.uma[seat]!)}
                </td>
                <td
                  className={cn(
                    "px-2 py-2 text-right font-semibold tabular",
                    final.scores[seat]! >= 0 ? "text-pos" : "text-neg",
                  )}
                >
                  {formatScore(final.scores[seat]!)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {meta}
    </div>
  );
}
