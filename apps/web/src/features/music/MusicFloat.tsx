import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

/** 电视右下角吸附浮窗：展开显示谁立直、放哪首；点击收起为小圆标，再点展开。 */
export function MusicFloat({ label }: { label: string }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <button
      type="button"
      data-testid="music-float"
      aria-label={collapsed ? `展开：${label}` : `收起：${label}`}
      onClick={() => setCollapsed((c) => !c)}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full border border-border bg-surface/95 shadow-lg backdrop-blur transition-all",
        collapsed ? "p-1" : "py-1 pl-1 pr-5",
      )}
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/50" />
        <Play className="relative h-5 w-5" fill="currentColor" />
      </span>
      {!collapsed && <span className="whitespace-nowrap text-lg font-medium">{label}</span>}
    </button>
  );
}
