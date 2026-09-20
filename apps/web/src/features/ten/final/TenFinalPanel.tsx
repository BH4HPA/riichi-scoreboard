import { formatPoints, type TenGameState } from "@riichi/core";
import { cn } from "@/lib/utils";

/** 终局结果：各自的累计得分，得分高的一方获胜；没有马点与顺位那一套。 */
export function TenFinalPanel({
  game,
  names,
  tv = false,
}: {
  game: TenGameState;
  names: string[];
  tv?: boolean;
}) {
  const final = game.final;
  if (!final) return null;
  const tsumo = game.history.filter((e) => e.kind === "tenTsumo");
  return (
    <div className={cn("space-y-2", tv && "space-y-3")} data-testid="ten-final">
      <p className={cn("font-semibold", tv ? "text-2xl" : "text-base")}>
        {final.winner === null ? "平局" : `${names[final.winner]} 获胜`}
      </p>
      <ul className={cn("space-y-1", tv ? "text-xl" : "text-sm")}>
        {final.scores.map((score, seat) => (
          <li key={seat} className="flex items-baseline justify-between gap-3">
            <span className={cn(final.winner === seat && "font-medium")}>{names[seat]}</span>
            <span className="text-muted">
              和牌 {tsumo.filter((e) => e.kind === "tenTsumo" && e.winner === seat).length} 次 ·
              立直棒剩 {game.sticks[seat]}
            </span>
            <span className="font-semibold tabular">{formatPoints(score)}</span>
          </li>
        ))}
      </ul>
      <p className={cn("text-muted", tv ? "text-sm" : "text-xs")}>
        共 {game.history.length} 局。二人麻将的对局不计入个人战绩。
      </p>
    </div>
  );
}
