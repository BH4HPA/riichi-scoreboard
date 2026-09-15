import { yakumanLabel, type UiIntent, type UiState } from "@riichi/core";
import { HandStrip, IndicatorRow } from "@/features/hand/HandStrip";
import { YakuChips } from "@/features/hand/YakuChips";
import { PreviewGrid } from "@/features/settlement/PreviewGrid";
import { Badge } from "@/ui/controls";

const MODE_LABELS = {
  tsumo: "自摸结算",
  ron: "荣和结算",
  draw: "流局结算",
  abortive: "途中流局",
  chombo: "错和罚符",
} as const;

type SettlementIntent = Extract<UiIntent, { kind: "settlement" }>;

/** 电视全屏模态：实时镜像手机端的结算录入（和牌者、牌面、番符役种、四家增减）。 */
export function SettlementMirror({
  state,
  intent,
  names,
}: {
  state: UiState;
  intent: SettlementIntent;
  names: string[];
}) {
  const who = state.seat !== null ? names[state.seat] : state.name;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-bg/90 p-8 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-2xl border border-accent/40 bg-surface p-8 shadow-2xl">
        <div className="flex items-center gap-3 text-lg text-muted">
          <Badge tone="accent" size="md">
            {who}
          </Badge>
          正在录入{MODE_LABELS[intent.mode]}
          {intent.loser !== null && intent.mode === "ron" && (
            <span className="ml-auto text-base">放铳：{names[intent.loser]}</span>
          )}
          {intent.riichi.length > 0 && (
            <span className={intent.loser !== null && intent.mode === "ron" ? "" : "ml-auto"}>
              立直：{intent.riichi.map((s) => names[s]).join("、")}
            </span>
          )}
        </div>

        {intent.wins.map((w) => (
          <div key={w.winner} className="mt-6 space-y-3">
            <div className="flex items-baseline gap-4">
              <span className="text-2xl font-semibold">{names[w.winner]}</span>
              <span className="text-4xl font-semibold tabular text-accent">
                {w.evaluated && w.evaluated.isAgari
                  ? w.evaluated.yakuman > 0
                    ? yakumanLabel(w.evaluated.yakuman)
                    : `${w.evaluated.han} 番 ${w.evaluated.fu} 符`
                  : (w.valueText ?? "填写中…")}
              </span>
            </div>
            {w.hand && (
              <>
                <HandStrip
                  closed={w.hand.closed}
                  melds={w.hand.melds}
                  winTile={w.hand.winTile}
                  size="lg"
                />
                <div className="flex flex-wrap gap-x-6">
                  <IndicatorRow label="宝牌指示" tiles={w.hand.doraIndicators} size="sm" />
                  <IndicatorRow label="里宝指示" tiles={w.hand.uraIndicators} size="sm" />
                </div>
              </>
            )}
            {w.evaluated?.isAgari && (
              <YakuChips
                yaku={w.evaluated.yaku}
                yakuman={w.evaluated.yakuman}
                className="text-base [&>span]:px-2.5 [&>span]:py-1"
              />
            )}
          </div>
        ))}

        <div className="mt-6">
          {intent.deltas ? (
            <PreviewGrid deltas={intent.deltas} names={names} size="lg" />
          ) : (
            <p className="text-xl text-muted">填写中…</p>
          )}
          {intent.summary && <p className="mt-4 text-xl">{intent.summary}</p>}
        </div>
      </div>
    </div>
  );
}
