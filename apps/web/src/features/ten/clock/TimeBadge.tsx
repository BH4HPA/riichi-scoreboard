import { Hourglass } from "lucide-react";
import type { TenTimeMark } from "@riichi/core";
import { Badge } from "@/ui/controls";
import { TIME_MARK_TEXT } from "./marks";

/** 没到 10 分钟不显示，之后常驻 */
export function TimeBadge({ mark, tv = false }: { mark: TenTimeMark; tv?: boolean }) {
  if (mark === 0) return null;
  return (
    <Badge tone={mark === 3 ? "neg" : "accent"} size={tv ? "md" : "sm"} data-testid="ten-time-mark">
      <Hourglass className="mr-1 inline h-3.5 w-3.5" />
      {TIME_MARK_TEXT[mark]}
    </Badge>
  );
}
