import { Fragment } from "react";
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

/** 手牌 + 指示牌 + 役种。 */
function WinHands({ entry, size }: { entry: HistoryEntry; size: TileSize }) {
  const shown = winHands(entry);
  if (shown.length === 0) return null;
  return (
    <div className="mt-1 space-y-2">
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

function DeltaCells({
  entry,
  compact = false,
  wide = false,
}: {
  entry: HistoryEntry;
  compact?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-y-0.5",
        wide ? "grid-cols-4 gap-x-4 text-sm" : "grid-cols-2 gap-x-3",
        !wide && (compact ? "text-[11px]" : "text-xs"),
      )}
    >
      {SEATS.map((s) => {
        const d = entry.deltas[s]!;
        return (
          <div key={s} className="flex items-center justify-between gap-2">
            <span className="truncate text-muted">{entry.names[s]}</span>
            <span className={cn("tabular", d > 0 ? "text-pos" : d < 0 ? "text-neg" : "text-muted")}>
              {formatDiff(d)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function HistoryTable({ history, tv = false }: { history: HistoryEntry[]; tv?: boolean }) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
        暂无记录，请通过操作栏录入对局结算。
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse", tv ? "text-base" : "text-sm")}>
        <thead className={cn("sticky top-0 bg-surface text-muted", tv ? "text-sm" : "text-xs")}>
          <tr>
            <th className={cn("px-2 py-1.5 text-left font-medium", tv ? "w-44" : "w-28")}>场次</th>
            <th className="w-24 px-2 py-1.5 text-left font-medium">庄家</th>
            <th className="w-32 px-2 py-1.5 text-left font-medium">立直玩家</th>
            <th className="px-2 py-1.5 text-left font-medium">点差变动</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry) => (
            <Fragment key={entry.seq}>
              <tr className="border-t border-border align-top">
                <td className="px-2 pt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="tabular">{roundLabel(entry.kyoku, entry.honba)}</span>
                    <Badge tone="outline" size={tv ? "md" : "sm"}>
                      {ENTRY_KIND_LABELS[entry.kind]}
                    </Badge>
                  </div>
                  <div className={cn("text-muted", tv ? "text-xs" : "text-[11px]")}>
                    {formatTime(entry.at)}
                  </div>
                </td>
                <td className="px-2 pt-2">{entry.names[entry.dealer]}</td>
                <td className="px-2 pt-2 text-muted">
                  {entry.riichi.length ? entry.riichi.map((s) => entry.names[s]).join("、") : "无"}
                </td>
                <td className="px-2 pt-2">
                  <DeltaCells entry={entry} wide={tv} />
                </td>
              </tr>
              <tr>
                <td colSpan={4} className="px-2 pb-2 pt-1">
                  <p className={cn("text-muted", tv ? "text-sm" : "text-xs")}>
                    {describeEntry(entry)}
                  </p>
                  <WinHands entry={entry} size={tv ? "sm" : "xs"} />
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 手机端紧凑列表 */
export function HistoryList({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) return <p className="py-4 text-center text-sm text-muted">暂无记录</p>;
  return (
    <ul className="divide-y divide-border">
      {history.map((entry) => (
        <li key={entry.seq} className="py-2">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="tabular text-fg">{roundLabel(entry.kyoku, entry.honba)}</span>
            <Badge tone="outline">{ENTRY_KIND_LABELS[entry.kind]}</Badge>
            <span className="ml-auto">{formatTime(entry.at)}</span>
          </div>
          <div className="mt-1">
            <DeltaCells entry={entry} compact />
          </div>
          <p className="mt-1 text-xs text-muted">{describeEntry(entry)}</p>
          <WinHands entry={entry} size="xs" />
        </li>
      ))}
    </ul>
  );
}
