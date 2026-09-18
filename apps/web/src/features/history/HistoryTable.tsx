import {
  describeEntry,
  ENTRY_KIND_LABELS,
  formatDiff,
  roundLabel,
  SEATS,
  type HistoryEntry,
  type WinRecord,
} from "@riichi/core";
import { Badge } from "@/ui/controls";
import { cn, formatTime } from "@/lib/utils";
import { HandStrip, IndicatorRow } from "@/features/hand/HandStrip";
import { YakuChips } from "@/features/hand/YakuChips";
import type { TileSize } from "@/features/hand/TileFace";

/** 牌面形态录入的和牌记录（番符快选的和牌 hand 为 null，不展示）。 */
function winHands(entry: HistoryEntry): WinRecord[] {
  if (entry.kind !== "tsumo" && entry.kind !== "ron") return [];
  const wins = entry.kind === "tsumo" ? [entry.win] : entry.wins;
  return wins.filter((w) => w.hand !== null);
}

function WinHands({ entry, size }: { entry: HistoryEntry; size: TileSize }) {
  const shown = winHands(entry);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-2">
      {shown.map((w) => (
        <div key={w.winner} className="space-y-1">
          {shown.length > 1 && (
            <div className="text-[11px] text-muted">{entry.names[w.winner]}</div>
          )}
          <HandStrip
            closed={w.hand!.closed}
            melds={w.hand!.melds}
            winTile={w.hand!.winTile}
            size={size}
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <IndicatorRow label="宝牌指示" tiles={w.hand!.doraIndicators} />
            <IndicatorRow label="里宝指示" tiles={w.hand!.uraIndicators} />
          </div>
          {w.yaku && <YakuChips yaku={w.yaku} yakuman={w.value.yakuman} />}
        </div>
      ))}
    </div>
  );
}

/** 四家增减：一行四格（电视）或两行两格（手机）。 */
function DeltaCells({ entry, tv }: { entry: HistoryEntry; tv: boolean }) {
  return (
    <div className={cn("grid gap-1.5", tv ? "grid-cols-4 text-sm" : "grid-cols-2 text-xs")}>
      {SEATS.map((s) => {
        const d = entry.deltas[s]!;
        return (
          <div
            key={s}
            className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2 py-1"
          >
            <span className="truncate text-muted">{entry.names[s]}</span>
            <span
              className={cn(
                "font-medium tabular",
                d > 0 ? "text-pos" : d < 0 ? "text-neg" : "text-muted",
              )}
            >
              {formatDiff(d)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 一条记录：场次行 → 四家增减 → 牌面/役种 → 结算说明。 */
function EntryCard({ entry, tv }: { entry: HistoryEntry; tv: boolean }) {
  return (
    <li className={cn("rounded-xl border border-border bg-surface", tv ? "p-4" : "p-3")}>
      <div
        className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", tv ? "text-base" : "text-sm")}
      >
        <span className="font-semibold tabular">{roundLabel(entry.kyoku, entry.honba)}</span>
        <Badge tone="outline" size={tv ? "md" : "sm"}>
          {ENTRY_KIND_LABELS[entry.kind]}
        </Badge>
        <span className="text-muted">庄家 {entry.names[entry.dealer]}</span>
        {entry.riichi.length > 0 && (
          <span className="text-muted">
            立直 {entry.riichi.map((s) => entry.names[s]).join("、")}
          </span>
        )}
        <span className={cn("ml-auto text-muted", tv ? "text-sm" : "text-xs")}>
          {formatTime(entry.at)}
        </span>
      </div>
      <div className="mt-2">
        <DeltaCells entry={entry} tv={tv} />
      </div>
      <div className="mt-2">
        <WinHands entry={entry} size={tv ? "sm" : "xs"} />
      </div>
      <p className={cn("mt-2 text-muted", tv ? "text-sm" : "text-xs")}>{describeEntry(entry)}</p>
    </li>
  );
}

/** 历史记录（新在前）。tv 决定字号与四家增减的排布。 */
export function HistoryTable({ history, tv = false }: { history: HistoryEntry[]; tv?: boolean }) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
        暂无记录，请通过操作栏录入对局结算。
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
