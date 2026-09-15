import { formatDiff, SEATS } from "@riichi/core";
import { cn } from "@/lib/utils";

export function PreviewGrid({
  deltas,
  names,
  className,
  size = "md",
}: {
  deltas: number[];
  names: string[];
  className?: string;
  /** lg：电视镜像 */
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  return (
    <div className={cn("grid grid-cols-2", lg ? "gap-3" : "gap-1.5", className)}>
      {SEATS.map((s) => {
        const d = deltas[s]!;
        return (
          <div
            key={s}
            className={cn(
              "flex items-center justify-between rounded-lg bg-surface-2",
              lg ? "px-4 py-3 text-xl" : "px-2.5 py-1.5 text-sm",
            )}
          >
            <span className="truncate text-muted">{names[s]}</span>
            <span
              className={cn(
                "font-semibold tabular",
                lg && "text-3xl",
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
