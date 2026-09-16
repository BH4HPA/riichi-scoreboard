import { yakumanLabel, type EvaluatedHand } from "@riichi/core";
import { YakuChips } from "@/features/hand/YakuChips";

/**
 * 番符结果行 + 役种。编辑态与确认态共用：同一个结论不该有两种写法。
 * `hint` 是牌面还没录满时的引导语（确认态不会出现这种情况）。
 */
export function ValueResult({
  complete,
  evaluated,
  evaluating,
  evalError,
  hint,
}: {
  complete: boolean;
  evaluated: EvaluatedHand | null;
  evaluating: boolean;
  evalError: string | null;
  hint?: string;
}) {
  return (
    <>
      <div className="flex min-h-8 items-center gap-2 text-sm" aria-live="polite">
        {!complete ? (
          <span className="text-muted">{hint}</span>
        ) : evaluating || !evaluated ? (
          <span className="text-muted">{evalError ? "" : "计算中…"}</span>
        ) : !evaluated.isAgari ? (
          <span className="text-neg">
            {evaluated.reason === "noYaku" ? "该牌型无役" : "不是和牌形"}
          </span>
        ) : evaluated.yakuman > 0 ? (
          <span className="text-lg font-semibold text-accent">
            {yakumanLabel(evaluated.yakuman)}
          </span>
        ) : (
          <span className="text-lg font-semibold">
            {evaluated.han} 番 {evaluated.fu} 符
          </span>
        )}
        {evalError && <span className="text-neg">{evalError}</span>}
      </div>
      {evaluated?.isAgari && <YakuChips yaku={evaluated.yaku} yakuman={evaluated.yakuman} />}
    </>
  );
}
