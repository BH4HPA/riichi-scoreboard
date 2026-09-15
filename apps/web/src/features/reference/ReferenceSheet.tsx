import type { ReferenceView, RoomRules } from "@riichi/core";
import { Tabs, TabsList, TabsTrigger } from "@/ui/controls";
import { cn } from "@/lib/utils";
import { FuFormula } from "./FuFormula";
import { PointsTable } from "./PointsTable";
import { SubTabs } from "./SubTabs";
import { YakuList } from "./YakuList";

const POINTS_SUBS = [
  { value: "ko", label: "闲家点数表" },
  { value: "oya", label: "庄家点数表" },
  { value: "fu", label: "符数计算表" },
];

/** 番符表：役种一览（按番数分页 + 示例牌）| 点数计算（闲家/庄家点数表 + 符数计算）。 */
export function ReferenceSheet({
  rules,
  view,
  onViewChange,
  tv = false,
}: {
  rules: RoomRules;
  view: ReferenceView;
  /** 未提供时为只读镜像 */
  onViewChange?: ((v: ReferenceView) => void) | undefined;
  tv?: boolean;
}) {
  const pointsSub = POINTS_SUBS.some((s) => s.value === view.sub) ? view.sub : "ko";
  const setSub = onViewChange ? (sub: string) => onViewChange({ tab: view.tab, sub }) : undefined;
  return (
    <Tabs
      value={view.tab}
      onValueChange={(tab) =>
        onViewChange?.({ tab: tab as ReferenceView["tab"], sub: tab === "yaku" ? "1" : "ko" })
      }
      className={cn("space-y-3", tv && "text-lg")}
    >
      <TabsList className={cn("w-full", tv && "h-11")}>
        <TabsTrigger value="yaku" className={cn("flex-1", tv && "h-9 text-base")}>
          役种一览
        </TabsTrigger>
        <TabsTrigger value="points" className={cn("flex-1", tv && "h-9 text-base")}>
          点数计算
        </TabsTrigger>
      </TabsList>
      {view.tab === "yaku" ? (
        <YakuList rules={rules} page={view.sub} onPageChange={setSub} tv={tv} />
      ) : (
        <div className="space-y-3">
          <SubTabs value={pointsSub} onChange={setSub} options={POINTS_SUBS} tv={tv} />
          {pointsSub === "fu" ? (
            <FuFormula tv={tv} />
          ) : (
            <PointsTable rules={rules} role={pointsSub === "oya" ? "oya" : "ko"} tv={tv} />
          )}
        </div>
      )}
    </Tabs>
  );
}
