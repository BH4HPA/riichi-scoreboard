import { ChipGroup } from "@/ui/controls";
import { cn } from "@/lib/utils";
import { CONSOLE_SCALES, setScale, useScale } from "./store";

const OPTIONS = CONSOLE_SCALES.map((s) => ({ value: s, label: `${Math.round(s * 100)}%` }));

/** 主控台「界面大小」三档切换，本机记住。 */
export function ScaleControl({ className }: { className?: string }) {
  const scale = useScale();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="whitespace-nowrap text-sm text-muted">界面大小</span>
      <ChipGroup value={scale} onChange={setScale} options={OPTIONS} className="flex-nowrap" />
    </div>
  );
}
