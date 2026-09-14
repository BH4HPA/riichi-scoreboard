import {
  describeEntry,
  ENTRY_KIND_LABELS,
  formatDiff,
  roundLabel,
  SEATS,
  type HistoryEntry,
} from "@riichi/core";
import { Badge } from "@/ui/controls";
import { cn, formatTime } from "@/lib/utils";

function DeltaCells({ entry, compact = false }: { entry: HistoryEntry; compact?: boolean }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-0.5", compact ? "text-[11px]" : "text-xs")}>
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
      <table className={cn("w-full min-w-[640px] border-collapse text-sm", tv && "text-base")}>
        <thead className="sticky top-0 bg-surface text-xs text-muted">
          <tr>
            <th className={cn("px-2 py-1.5 text-left font-medium", tv ? "w-40" : "w-28")}>场次</th>
            <th className="w-16 px-2 py-1.5 text-left font-medium">庄家</th>
            <th className="w-28 px-2 py-1.5 text-left font-medium">立直玩家</th>
            <th className="w-44 px-2 py-1.5 text-left font-medium">点差变动</th>
            <th className="px-2 py-1.5 text-left font-medium">结算信息</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry) => (
            <tr key={entry.seq} className="border-t border-border align-top">
              <td className="px-2 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="tabular">{roundLabel(entry.kyoku, entry.honba)}</span>
                  <Badge tone="outline">{ENTRY_KIND_LABELS[entry.kind]}</Badge>
                </div>
                <div className="text-[11px] text-muted">{formatTime(entry.at)}</div>
              </td>
              <td className="px-2 py-2">{entry.names[entry.dealer]}</td>
              <td className="px-2 py-2 text-muted">
                {entry.riichi.length ? entry.riichi.map((s) => entry.names[s]).join("、") : "无"}
              </td>
              <td className="px-2 py-2">
                <DeltaCells entry={entry} />
              </td>
              <td className="px-2 py-2 text-muted">{describeEntry(entry)}</td>
            </tr>
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
        </li>
      ))}
    </ul>
  );
}
