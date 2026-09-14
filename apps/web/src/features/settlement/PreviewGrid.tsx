import { formatDiff, SEATS } from "@riichi/core";
import { cn } from "@/lib/utils";

export function PreviewGrid({
  deltas,
  names,
  className,
}: {
  deltas: number[];
  names: string[];
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-1.5", className)}>
      {SEATS.map((s) => {
        const d = deltas[s]!;
        return (
          <div
            key={s}
            className="flex items-center justify-between rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm"
          >
            <span className="truncate text-muted">{names[s]}</span>
            <span
              className={cn(
                "font-semibold tabular",
                d > 0 ? "text-pos" : d < 0 ? "text-neg" : "text-muted",
              )}
            >
              {formatDiff(d)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
