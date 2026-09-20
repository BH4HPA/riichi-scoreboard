import { Cast } from "lucide-react";
import { Switch } from "@/ui/controls";

/** 个人查阅默认只在手机上；打开后才把当前内容投到电视（关弹窗即恢复为不投）。 */
export function CastSwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    // 吸在弹层内容区顶部：内容长（规则说明五节平铺、规则表）时滚下去了也能随手关掉投屏
    <label className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-muted">
        <Cast className="h-4 w-4" /> 投到电视
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
