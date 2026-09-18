import { formatDiff, type Seat, type WinPayment } from "@riichi/core";
import { Label } from "@/ui/controls";
import { PreviewGrid } from "../PreviewGrid";
import { incomeBreakdown } from "../format";

export interface WinIncome {
  seat: Seat;
  verb: "自摸" | "荣和";
  baseIncome: number;
  payment: WinPayment;
}

/** 和牌结算的预览块：四家增减 + 每位和牌者的最终收入与拆解；未填齐时给提示。 */
export function WinPreview({
  names,
  deltas,
  incomes,
}: {
  names: string[];
  deltas: number[] | null;
  incomes: WinIncome[];
}) {
  return (
    <div>
      <Label>结算预览</Label>
      {deltas ? (
        <>
          <PreviewGrid deltas={deltas} names={names} className="mt-1" />
          {incomes.map((w, i) => (
            <div key={i} className="mt-2">
              <p className="text-sm">
                {names[w.seat]}
                {w.verb}的最终收入：
                <span className="font-semibold text-pos">{formatDiff(deltas[w.seat]!)}</span> 点
              </p>
              <p className="text-xs text-muted">
                {incomeBreakdown({
                  base: w.baseIncome,
                  honba: w.payment.honbaIncome,
                  kyotaku: w.payment.kyotakuIncome,
                  riichi: w.payment.riichiIncome,
                })}
              </p>
            </div>
          ))}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">请先完整选择和填写</p>
      )}
    </div>
  );
}

/** 底栏按钮上方独占一行：填齐了是「谁和了谁 · 收入」，没填齐是还缺什么。 */
export function FooterSummary({ text, ready }: { text: string; ready: boolean }) {
  return (
    <p
      className={ready ? "basis-full text-sm font-medium" : "basis-full text-sm text-muted"}
      data-testid="settlement-summary"
    >
      {text}
    </p>
  );
}
