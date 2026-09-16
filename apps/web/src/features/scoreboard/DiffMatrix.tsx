import { computeRanks, formatDiff, standings, type GameState, type RoomRules } from "@riichi/core";
import { Badge } from "@/ui/controls";
import { cn } from "@/lib/utils";
import type { ScoreSize } from "./PointsGrid";

const STYLE = {
  phone: { table: "text-sm", head: "text-xs", cell: "py-1.5", badge: "sm" },
  pad: { table: "text-base", head: "text-sm", cell: "py-2", badge: "md" },
  tv: { table: "text-lg", head: "text-sm", cell: "py-2", badge: "md" },
} as const;

/** 分差矩阵：行减列，正为行领先。 */
export function DiffMatrix({
  game,
  names,
  rules,
  size = "phone",
}: {
  game: GameState;
  names: string[];
  rules: RoomRules;
  size?: ScoreSize;
}) {
  const order = standings(game.points);
  const ranks = computeRanks(game.points, rules.final.tieRule);
  const st = STYLE[size];
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse", st.table)}>
        <thead>
          <tr className={cn("text-muted", st.head)}>
            <th className="px-2 py-1.5 text-left font-medium">点差</th>
            {order.map((s) => (
              <th key={s} className="max-w-24 truncate px-2 py-1.5 text-right font-medium">
                {names[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((row) => (
            <tr key={row} className="border-t border-border">
              <td className={cn("px-2", st.cell)}>
                <div className="flex items-center gap-1.5">
                  <Badge tone="outline" size={st.badge}>
                    {ranks[row]}
                  </Badge>
                  <span className="max-w-32 truncate">{names[row]}</span>
                </div>
              </td>
              {order.map((col) => {
                const d = game.points[row]! - game.points[col]!;
                return (
                  <td
                    key={col}
                    className={cn(
                      "px-2 text-right tabular",
                      st.cell,
                      row === col
                        ? "text-muted/50"
                        : d > 0
                          ? "text-pos"
                          : d < 0
                            ? "text-neg"
                            : "text-muted",
                    )}
                  >
                    {row === col ? "—" : formatDiff(d)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
