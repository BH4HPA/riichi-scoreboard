import { Hourglass } from "lucide-react";
import type { TenStage, TenTimeMark } from "@riichi/core";
import { Badge } from "@/ui/controls";
import { timeMarkText } from "./marks";

/** 没到 10 分钟不显示，之后常驻 */
export function TimeBadge({
  mark,
  stage,
  tv = false,
}: {
  mark: TenTimeMark;
  stage: TenStage["kind"];
  tv?: boolean;
}) {
  if (mark === 0) return null;
  return (
    <Badge tone={mark === 3 ? "neg" : "accent"} size={tv ? "md" : "sm"} data-testid="ten-time-mark">
      <Hourglass className="mr-1 inline h-3.5 w-3.5" />
      {timeMarkText(mark, stage)}
    </Badge>
  );
}
