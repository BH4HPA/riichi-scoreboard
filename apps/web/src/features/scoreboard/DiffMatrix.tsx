import { computeRanks, formatDiff, standings, type GameState, type RoomRules } from "@riichi/core";
import { Badge } from "@/ui/controls";
import { cn } from "@/lib/utils";

/** 分差矩阵：行减列，正为行领先。 */
export function DiffMatrix({
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
  const order = standings(game.points);
  const ranks = computeRanks(game.points, rules.final.tieRule);
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse", tv ? "text-lg" : "text-sm")}>
        <thead>
          <tr className={cn("text-muted", tv ? "text-sm" : "text-xs")}>
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
              <td className={cn("px-2", tv ? "py-2" : "py-1.5")}>
                <div className="flex items-center gap-1.5">
                  <Badge tone="outline" size={tv ? "md" : "sm"}>
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
                      tv ? "py-2" : "py-1.5",
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
