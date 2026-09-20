import { formatDiff, type UiIntent, type UiState } from "@riichi/core";
import { Badge } from "@/ui/controls";
import { cn } from "@/lib/utils";
import { MIRROR_HOLD_MS, MIRROR_STALE, MIRROR_STALE_TRANSITION } from "@/features/mirror/held";
import { WinBlock } from "@/features/mirror/SettlementMirror";
import { useHeld } from "@/features/mirror/useHeld";

type TenSettlementIntent = Extract<UiIntent, { kind: "tenSettlement" }>;

/** 电视全屏模态：实时镜像手机端的二人房结算（自摸和的牌面、番符与得分，或正在确认的流局）。 */
export function TenSettlementMirror({
  state,
  intent,
  names,
}: {
  state: UiState;
  intent: TenSettlementIntent;
  names: string[];
}) {
  const who = state.seat !== null ? names[state.seat] : state.name;
  const gain = useHeld(intent.gain, MIRROR_HOLD_MS);
  const summary = useHeld(intent.summary, MIRROR_HOLD_MS);
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-bg/90 p-8 backdrop-blur-sm"
      data-testid="ten-settlement-mirror"
    >
      <div className="w-full max-w-5xl rounded-2xl border border-accent/40 bg-surface p-8 shadow-2xl">
        <div className="flex items-center gap-3 text-lg text-muted">
          <Badge tone="accent" size="md">
            {who}
          </Badge>
          正在录入{intent.mode === "tsumo" ? "自摸和" : "流局"}
        </div>
        {intent.win && <WinBlock win={intent.win} names={names} />}
        <div className="mt-6">
          {gain.value !== null && (
            <p
              className={cn(
                "text-5xl font-semibold tabular text-pos",
                MIRROR_STALE_TRANSITION,
                gain.stale && MIRROR_STALE,
              )}
            >
              {formatDiff(gain.value)}
            </p>
          )}
          {summary.value ? (
            <p
              className={cn("mt-4 text-xl", MIRROR_STALE_TRANSITION, summary.stale && MIRROR_STALE)}
            >
              {summary.value}
            </p>
          ) : (
            <p className="text-xl text-muted">填写中…</p>
          )}
        </div>
      </div>
    </div>
  );
}
