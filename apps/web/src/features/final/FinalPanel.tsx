import {
  formatPoints,
  formatScore,
  standings,
  type GameState,
  type PlayerRef,
  type RoomRules,
} from "@riichi/core";
import { Avatar } from "@/ui/avatar";
import { cn, formatDateTime } from "@/lib/utils";

export function umaDescription(rules: RoomRules): string {
  const [a, b, c, d] = rules.final.uma;
  const oka = ((rules.final.returnPoints - rules.final.startPoints) * 4) / 1000;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return `${rules.final.startPoints / 1000}000 起 / ${rules.final.returnPoints / 1000}000 返，顺位马 ${sign(a)}/${sign(b)}/${sign(c)}/${sign(d)}${oka ? `，oka ${sign(oka)} 归一位` : ""}${rules.final.tieRule === "split" ? "，同点按分" : "，同点起家优先"}`;
}

export function FinalPanel({
  game,
  seats,
  names,
  rules,
  tv = false,
}: {
  game: GameState;
  seats: (PlayerRef | null)[];
  names: string[];
  rules: RoomRules;
  tv?: boolean;
}) {
  const final = game.final;
  if (!final) return null;
  const order = standings(final.points);
  return (
    <div>
      <p className="text-xs text-muted">{umaDescription(rules)}</p>
      <table className={cn("mt-2 w-full border-collapse", tv ? "text-lg" : "text-sm")}>
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">排名</th>
            <th className="px-2 py-1.5 text-left font-medium">玩家</th>
            <th className="px-2 py-1.5 text-right font-medium">分数</th>
            <th className="px-2 py-1.5 text-right font-medium">马点</th>
            <th className="px-2 py-1.5 text-right font-medium">得分</th>
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
      <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
        <span>
          持续时间：
          {Math.max(0, Math.floor(((game.finishedAt ?? game.startedAt) - game.startedAt) / 60000))}{" "}
          分钟
        </span>
        {game.finishedAt && <span>结束时间：{formatDateTime(game.finishedAt)}</span>}
        {game.tobi && <span>击飞：{names[game.tobi.seat]}</span>}
      </div>
    </div>
  );
}
