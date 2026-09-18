import { useState } from "react";
import { ArrowLeft, Camera } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/ui/button";
import { Notice } from "@/ui/notice";
import { CameraSheet } from "@/features/recognition/camera/CameraSheet";
import { RECOGNITION_MODEL } from "@/features/recognition/modelUrl";
import { CalcContextCard, type CalcContext } from "@/features/calc/context/CalcContextCard";
import { useEvaluation } from "@/features/calc/evaluate/useEvaluation";
import { CalcResult } from "@/features/calc/result/CalcResult";
import { CalcReview } from "@/features/calc/review/CalcReview";
import { CalcRulesDialog } from "@/features/calc/rules/CalcRulesDialog";
import { useCalcRules } from "@/features/calc/rules/useCalcRules";
import { useCalcShot } from "@/features/calc/shot/useCalcShot";
import { conformDraftToRules } from "@/features/settlement/hand/conformRules";
import { SiteBrand, SiteFooter } from "@/features/site/SiteFooter";

/**
 * 拍照算点数：不进房间，设好场况 → 拍 → 核对识别结果 →「识别正确」出番符与点数 → 继续拍。
 * 与房间结算共用取景框和牌面编辑器；确认的手牌同时回填为识别的训练真值。
 */
export function Calc() {
  const [rules, setRules] = useCalcRules();
  const [context, setContext] = useState<CalcContext>({ roundWind: 0, seatWind: 0, honba: 0 });
  const [rulesOpen, setRulesOpen] = useState(false);
  const shot = useCalcShot(rules);
  const isDealer = context.seatWind === 0;
  const evaluation = useEvaluation(
    shot.phase === "result"
      ? {
          hand: shot.draft.hand,
          rules,
          roundWind: context.roundWind,
          seatWind: context.seatWind,
        }
      : null,
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="返回首页">
          <Link to="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">拍照算点数</h1>
      </header>
      <p className="text-sm text-muted">拍下和了的一手牌，核对识别结果，算出番符和点数。</p>

      <CalcContextCard
        context={context}
        onContextChange={setContext}
        tsumo={shot.draft.hand.tsumo}
        onTsumoChange={shot.setTsumo}
        rules={rules}
        onEditRules={() => setRulesOpen(true)}
      />

      {shot.phase === "idle" &&
        // 相机用不了（无权限、非 HTTPS）不在这里拦：取景页自己说明原因、禁用快门并给相册入口
        (!RECOGNITION_MODEL ? (
          <p className="text-sm text-muted">识别模型还没有发布，暂时不能拍照识别。</p>
        ) : (
          <Button variant="accent" size="lg" onClick={shot.shoot}>
            <Camera className="h-5 w-5" />
            开始拍
          </Button>
        ))}
      {shot.phase === "review" && (
        <CalcReview
          shot={shot.shot}
          draft={shot.draft}
          onDraftChange={shot.setDraft}
          rules={rules}
          isDealer={isDealer}
          onRetake={shot.shoot}
          onConfirm={shot.confirm}
        />
      )}
      {shot.phase === "result" && (
        <CalcResult
          hand={shot.draft.hand}
          rules={rules}
          isDealer={isDealer}
          honba={context.honba}
          evaluated={evaluation.evaluated}
          evaluating={evaluation.evaluating}
          error={evaluation.error}
          onBack={shot.backToReview}
          onNext={shot.next}
        />
      )}

      <div className="mt-auto flex flex-col items-center gap-2 pt-6">
        <SiteBrand />
        <SiteFooter className="justify-center" />
      </div>

      <CalcRulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        rules={rules}
        onApply={(next) => {
          setRules(next);
          shot.setDraft((d) => conformDraftToRules(d, next));
        }}
      />
      {shot.shooting && (
        <CameraSheet
          rules={rules}
          mode="calc"
          onCapture={shot.onCapture}
          onClose={shot.closeCamera}
        />
      )}
      <Notice />
    </main>
  );
}
