import {
  YAKU_PAGES,
  YAKU_TAG_LABELS,
  yakuHanText,
  type RoomRules,
  type YakuInfo,
} from "@riichi/core";
import { HandStrip, IndicatorRow } from "@/features/hand/HandStrip";
import { cn } from "@/lib/utils";
import { SubTabs } from "./SubTabs";

const TAG_TONE: Record<string, string> = {
  closedOnly: "text-pos",
  openMinusOne: "text-muted",
  pao: "text-accent",
  ruleDependent: "text-muted",
};

function YakuCard({ info, tv }: { info: YakuInfo; tv: boolean }) {
  const han = yakuHanText(info);
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-1.5">
        <h4 className={cn("font-semibold", tv ? "text-xl" : "text-base")}>{info.name}</h4>
        <div className={cn("flex items-center gap-2 tabular", tv ? "text-base" : "text-xs")}>
          {info.tags.map((t) => (
            <span key={t} className={cn("font-medium", TAG_TONE[t])}>
              {YAKU_TAG_LABELS[t]}
            </span>
          ))}
          <span className="font-semibold text-fg">{han.main}</span>
          {han.sub && <span className="text-muted">{han.sub}</span>}
        </div>
      </header>
      <div className="space-y-2 px-3 py-2">
        <p className={cn("text-muted", tv ? "text-base" : "text-sm")}>{info.description}</p>
        {info.example && (
          <>
            <HandStrip
              closed={info.example.closed}
              melds={info.example.melds}
              winTile={info.example.winTile}
              size={tv ? "md" : "sm"}
            />
            <div className="flex flex-wrap gap-x-3">
              <IndicatorRow label="宝牌指示" tiles={info.example.doraIndicators} size="sm" />
              <IndicatorRow label="里宝指示" tiles={info.example.uraIndicators} size="sm" />
            </div>
          </>
        )}
      </div>
    </article>
  );
}

/** 役种一览：按番数分页，每役一张卡（名称 / 标签 / 说明 / 示例牌）。 */
export function YakuList({
  rules,
  page,
  onPageChange,
  tv,
}: {
  rules: RoomRules;
  page: string;
  onPageChange?: ((key: string) => void) | undefined;
  tv: boolean;
}) {
  const current = YAKU_PAGES.find((p) => p.key === page) ?? YAKU_PAGES[0]!;
  return (
    <div className="space-y-3">
      <SubTabs
        value={current.key}
        onChange={onPageChange}
        options={YAKU_PAGES.map((p) => ({ value: p.key, label: p.title }))}
        tv={tv}
      />
      {current.key === "double" && !rules.scoring.doubleYakuman && (
        <p className="text-xs text-muted">当前房间规则未开启多倍役满，以下役种按单倍役满计算。</p>
      )}
      {current.key === "mangan" && !rules.hand.nagashiMangan && (
        <p className="text-xs text-muted">当前房间规则未开启流局满贯。</p>
      )}
      <div className={cn("grid gap-3", tv ? "grid-cols-2" : "grid-cols-1")}>
        {current.items.map((info) => (
          <YakuCard key={info.id} info={info} tv={tv} />
        ))}
      </div>
    </div>
  );
}
