import {
  describeTenEntry,
  formatDiff,
  TEN_DRAW_LABELS,
  tenRoundLabel,
  type TenEntry,
} from "@riichi/core";
import { Badge } from "@/ui/controls";
import { cn, formatTime } from "@/lib/utils";
import { HandStrip, IndicatorRow } from "@/features/hand/HandStrip";
import { YakuChips } from "@/features/hand/YakuChips";

function EntryCard({ entry, tv }: { entry: TenEntry; tv: boolean }) {
  const hand = entry.kind === "tenTsumo" ? entry.hand : null;
  return (
    <li className={cn("rounded-xl border border-border bg-surface", tv ? "p-4" : "p-3")}>
      <div
        className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", tv ? "text-base" : "text-sm")}
      >
        <span className="font-semibold tabular">{tenRoundLabel(entry.round, entry.honba)}</span>
        <Badge tone="outline" size={tv ? "md" : "sm"}>
          {entry.kind === "tenDraw" ? TEN_DRAW_LABELS[entry.reason] : "自摸和"}
        </Badge>
        <span className="text-muted">庄家 {entry.names[entry.dealer]}</span>
        {entry.kind === "tenTsumo" && (
          <span className="font-medium tabular text-pos">
            {entry.names[entry.winner]} {formatDiff(entry.gain)}
          </span>
        )}
        <span className={cn("ml-auto text-muted", tv ? "text-sm" : "text-xs")}>
          {formatTime(entry.at)}
        </span>
      </div>
      {entry.kind === "tenTsumo" && hand && (
        <div className="mt-2 space-y-1">
          <HandStrip
            closed={hand.closed}
            melds={hand.melds}
            winTile={hand.winTile}
            size={tv ? "sm" : "xs"}
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <IndicatorRow label="宝牌指示" tiles={hand.doraIndicators} />
            <IndicatorRow label="里宝指示" tiles={hand.uraIndicators} />
          </div>
          {entry.yaku && <YakuChips yaku={entry.yaku} yakuman={entry.value.yakuman} />}
        </div>
      )}
      <p className={cn("mt-2 text-muted", tv ? "text-sm" : "text-xs")}>{describeTenEntry(entry)}</p>
    </li>
  );
}

/** 二人房的历史记录（新在前）：一局一条——自摸和或三种流局之一。 */
export function TenHistoryTable({ history, tv = false }: { history: TenEntry[]; tv?: boolean }) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
        暂无记录。听牌的一方先宣言，再记这一局的结果。
      </div>
    );
  }
  return (
    <ul className={cn("flex flex-col", tv ? "gap-3" : "gap-2")}>
      {history.map((entry) => (
        <EntryCard key={entry.seq} entry={entry} tv={tv} />
      ))}
    </ul>
  );
}
