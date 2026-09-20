import { yakumanLabel, type SettlementWinView, type UiIntent, type UiState } from "@riichi/core";
import { HandStrip, IndicatorRow } from "@/features/hand/HandStrip";
import { YakuChips } from "@/features/hand/YakuChips";
import { PreviewGrid } from "@/features/settlement/PreviewGrid";
import { Badge } from "@/ui/controls";
import { cn } from "@/lib/utils";
import { MIRROR_HOLD_MS, MIRROR_STALE, MIRROR_STALE_TRANSITION } from "./held";
import { useHeld } from "./useHeld";

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
  const deltas = useHeld(intent.deltas, MIRROR_HOLD_MS);
  const summary = useHeld(intent.summary, MIRROR_HOLD_MS);
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
          <WinBlock key={w.winner} win={w} names={names} />
        ))}

        <div className="mt-6">
          {deltas.value ? (
            <PreviewGrid
              deltas={deltas.value}
              names={names}
              size="lg"
              className={cn(MIRROR_STALE_TRANSITION, deltas.stale && MIRROR_STALE)}
            />
          ) : (
            <p className="text-xl text-muted">填写中…</p>
          )}
          {summary.value && (
            <p
              className={cn("mt-4 text-xl", MIRROR_STALE_TRANSITION, summary.stale && MIRROR_STALE)}
            >
              {summary.value}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** 一位和牌者：牌面与算番结果在重算期间按住上一份并调暗。二人房的结算镜像也用它。 */
export function WinBlock({ win, names }: { win: SettlementWinView; names: string[] }) {
  const hand = useHeld(win.hand, MIRROR_HOLD_MS);
  const evaluated = useHeld(win.evaluated?.isAgari ? win.evaluated : null, MIRROR_HOLD_MS);
  const e = evaluated.value;
  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-baseline gap-4">
        <span className="text-2xl font-semibold">{names[win.winner]}</span>
        <span
          className={cn(
            "text-4xl font-semibold tabular text-accent",
            MIRROR_STALE_TRANSITION,
            evaluated.stale && MIRROR_STALE,
          )}
        >
          {e
            ? e.yakuman > 0
              ? yakumanLabel(e.yakuman)
              : `${e.han} 番 ${e.fu} 符`
            : (win.valueText ?? "填写中…")}
        </span>
      </div>
      {hand.value && (
        <div className={cn("space-y-3", MIRROR_STALE_TRANSITION, hand.stale && MIRROR_STALE)}>
          <HandStrip
            closed={hand.value.closed}
            melds={hand.value.melds}
            winTile={hand.value.winTile}
            size="lg"
          />
          <div className="flex flex-wrap gap-x-6">
            <IndicatorRow label="宝牌指示" tiles={hand.value.doraIndicators} size="sm" />
            <IndicatorRow label="里宝指示" tiles={hand.value.uraIndicators} size="sm" />
          </div>
        </div>
      )}
      {e && (
        <YakuChips
          yaku={e.yaku}
          yakuman={e.yakuman}
          className={cn(
            "text-base [&>span]:px-2.5 [&>span]:py-1",
            MIRROR_STALE_TRANSITION,
            evaluated.stale && MIRROR_STALE,
          )}
        />
      )}
    </div>
  );
}
