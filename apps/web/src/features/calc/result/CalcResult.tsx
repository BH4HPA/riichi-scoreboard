import { Camera, Pencil } from "lucide-react";
import { winPoints, type EvaluatedHand, type HandInput, type RoomRules } from "@riichi/core";
import { Button } from "@/ui/button";
import { HandView } from "@/features/hand/HandView";
import { ValueResult } from "@/features/settlement/hand/ValueResult";
import { pointsText } from "./pointsText";

/** 确认后的结论：只读牌面 + 番符役种 + 点数。场况、规则改了会自动重算，所以这里不缓存任何结果。 */
export function CalcResult({
  hand,
  rules,
  isDealer,
  honba,
  evaluated,
  evaluating,
  error,
  onBack,
  onNext,
}: {
  hand: HandInput;
  rules: RoomRules;
  isDealer: boolean;
  honba: number;
  evaluated: EvaluatedHand | null;
  evaluating: boolean;
  error: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const points =
    evaluated?.isAgari && !evaluating
      ? winPoints(evaluated, { dealer: isDealer, tsumo: hand.tsumo, honba }, rules)
      : null;
  const text = points && pointsText(points);
  return (
    <section className="space-y-3">
      <HandView
        hand={hand}
        size="sm"
        scroll
        showUra={rules.hand.uraDora && (hand.riichi || hand.doubleRiichi)}
      />
      <div className="rounded-xl border border-border bg-surface p-3" data-testid="calc-result">
        <ValueResult
          complete
          evaluated={evaluating ? null : evaluated}
          evaluating={evaluating}
          evalError={error}
        />
        {points && text && (
          <div className="mt-3 border-t border-border pt-3" data-testid="calc-points">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular">{text.main}</span>
              {/* 役满的档位 ValueResult 已经写了，这里只补满贯到累计役满 */}
              {evaluated?.yakuman === 0 && points.label && (
                <span className="text-sm text-accent">{points.label}</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">{text.detail}</p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={onBack}>
          <Pencil className="h-4 w-4" />
          返回修改
        </Button>
        <Button variant="accent" size="lg" onClick={onNext} data-testid="calc-next">
          <Camera className="h-5 w-5" />
          继续拍
        </Button>
      </div>
    </section>
  );
}
