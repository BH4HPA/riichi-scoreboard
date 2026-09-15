import { yakuName, yakumanLabel } from "@riichi/core";
import { cn } from "@/lib/utils";

/** 役种小标签：役满显示役满名，否则「役名 N 番」。 */
export function YakuChips({
  yaku,
  yakuman,
  className,
}: {
  yaku: Record<string, number>;
  yakuman: number;
  className?: string;
}) {
  const entries = Object.entries(yaku);
  if (entries.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1 text-xs", className)}>
      {yakuman > 0 && (
        <span className="rounded-md bg-accent px-1.5 py-0.5 font-medium text-accent-fg">
          {yakumanLabel(yakuman)}
        </span>
      )}
      {entries.map(([id, han]) => (
        <span key={id} className="rounded-md bg-surface-2 px-1.5 py-0.5">
          {yakuName(id)}
          {yakuman > 0 ? "" : ` ${han} 番`}
        </span>
      ))}
    </div>
  );
}
