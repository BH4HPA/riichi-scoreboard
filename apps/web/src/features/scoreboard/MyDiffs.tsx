import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatPoints, type GameState, type RoomRules, type Seat } from "@riichi/core";
import { cn } from "@/lib/utils";
import { DiffMatrix } from "./DiffMatrix";
import { myDiffs } from "./diffRows";

/** 手机入座者的点差：先回答「我和三家差多少」，全桌矩阵按需展开。 */
export function MyDiffs({
  game,
  names,
  rules,
  mySeat,
}: {
  game: GameState;
  names: string[];
  rules: RoomRules;
  mySeat: Seat;
}) {
  const [all, setAll] = useState(false);
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-muted">我的点差</h3>
      <ul className="divide-y divide-border text-sm">
        {myDiffs(game.points, mySeat).map(({ seat, diff }) => (
          <li key={seat} className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0 truncate">{names[seat]}</span>
            <span
              className={cn(
                "shrink-0 tabular",
                diff > 0 ? "text-pos" : diff < 0 ? "text-neg" : "text-muted",
              )}
            >
              {diff > 0 ? "领先 " : diff < 0 ? "落后 " : "持平"}
              {diff !== 0 && formatPoints(Math.abs(diff))}
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-1 flex items-center gap-1 text-xs text-muted hover:text-fg"
        aria-expanded={all}
        onClick={() => setAll((v) => !v)}
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", all && "rotate-180")} />
        全桌点差
      </button>
      {all && (
        <div className="mt-2">
          <DiffMatrix game={game} names={names} rules={rules} />
        </div>
      )}
    </div>
  );
}
