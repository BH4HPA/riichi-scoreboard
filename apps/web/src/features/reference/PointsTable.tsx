import {
  buildPointsTable,
  formatPoints,
  limitCards,
  MANGAN_CELL,
  POINT_TABLE_HAN,
  type PointCell,
  type PointRole,
  type RoomRules,
} from "@riichi/core";
import { cn } from "@/lib/utils";

function tsumoText(cell: PointCell, role: PointRole): string {
  if (!cell.tsumo) return "—";
  return role === "oya"
    ? `${formatPoints(cell.tsumo.oya)} all`
    : `${formatPoints(cell.tsumo.ko)},${formatPoints(cell.tsumo.oya)}`;
}

function CellBody({
  cell,
  role,
  label,
  tv,
}: {
  cell: PointCell;
  role: PointRole;
  label?: string;
  tv: boolean;
}) {
  return (
    <div className="flex flex-col items-center leading-tight">
      {label && (
        <span className={cn("font-semibold text-accent", tv ? "text-base" : "text-xs")}>
          {label}
        </span>
      )}
      <span className={cn("font-semibold tabular", tv ? "text-2xl" : "text-base")}>
        {cell.ron === null ? "—" : formatPoints(cell.ron)}
      </span>
      <span className={cn("tabular text-muted", tv ? "text-sm" : "text-[11px]")}>
        {tsumoText(cell, role)}
      </span>
    </div>
  );
}

/** 闲家 / 庄家点数表：格内上行荣和、下行自摸；满贯及以上合并成块；右侧满贯以上卡片。 */
export function PointsTable({
  rules,
  role,
  tv,
}: {
  rules: RoomRules;
  role: PointRole;
  tv: boolean;
}) {
  const rows = buildPointsTable(rules, role);
  const mangan = MANGAN_CELL(rules, role);
  const cards = limitCards(rules, role);
  const th = cn("px-2 py-1.5 text-center font-medium text-accent", tv ? "text-base" : "text-xs");
  const td = cn("border-t border-border px-1 py-1 text-center", tv ? "py-2" : "");
  return (
    <div className={cn("grid gap-3", tv ? "grid-cols-[1fr_180px]" : "grid-cols-1")}>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-collapse">
          <thead className="bg-surface-2">
            <tr>
              <th className={th}>符</th>
              {POINT_TABLE_HAN.map((h) => (
                <th key={h} className={th}>
                  {h} 番
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.fu}>
                <td className={cn(td, "bg-surface-2 font-medium tabular")}>{row.fu}</td>
                {row.cells.map((c) => (
                  <td key={c.han} className={td}>
                    <CellBody cell={c.cell} role={role} tv={tv} />
                  </td>
                ))}
                {row.manganBlock && (
                  <td
                    className={cn(td, "bg-accent/10 align-middle")}
                    colSpan={POINT_TABLE_HAN.length - row.cells.length}
                    rowSpan={row.manganBlock.rowSpan}
                  >
                    <CellBody cell={mangan} role={role} label="满贯" tv={tv} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className={cn("px-3 py-2 text-muted", tv ? "text-sm" : "text-[11px]")}>
          每格第一行为荣和时收取点数；第二行为自摸时
          {role === "oya" ? "每家支付点数" : "分别收取【闲家，庄家】点数"}。
          {rules.scoring.kiriageMangan ? "含切上满贯。" : ""}
        </p>
      </div>
      <div className={cn("grid gap-2", tv ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3")}>
        {cards.map((c) => (
          <div
            key={c.hanText}
            className="overflow-hidden rounded-xl border border-border bg-surface text-center"
          >
            <div
              className={cn(
                "bg-surface-2 py-1 font-medium text-accent",
                tv ? "text-base" : "text-xs",
              )}
            >
              {c.hanText}
            </div>
            <div className="py-2">
              <CellBody cell={c.cell} role={role} label={c.label} tv={tv} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
