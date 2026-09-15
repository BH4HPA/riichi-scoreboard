import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadRing } from "./LoadRing";

/**
 * 电视右下角吸附浮窗：展开显示谁立直、放哪首；点击收起为小圆标，再点展开。
 * loading 非 null 表示曲子还在下载（0–1 进度），图标外圈画进度环；播放中改为脉动。
 */
export function MusicFloat({ label, loading }: { label: string; loading: number | null }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <button
      type="button"
      data-testid="music-float"
      aria-label={collapsed ? `展开：${label}` : `收起：${label}`}
      aria-busy={loading !== null}
      onClick={() => setCollapsed((c) => !c)}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full border border-border bg-surface/95 shadow-lg backdrop-blur transition-all",
        collapsed ? "p-1" : "py-1 pl-1 pr-5",
      )}
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
        {loading === null ? (
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/50" />
        ) : (
          <LoadRing progress={loading} className="p-[3px]" />
        )}
        <Play className="relative h-5 w-5" fill="currentColor" />
      </span>
      {!collapsed && <span className="whitespace-nowrap text-lg font-medium">{label}</span>}
    </button>
  );
}
