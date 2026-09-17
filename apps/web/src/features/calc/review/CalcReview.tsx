import { Camera, Check } from "lucide-react";
import type { Detection, RoomRules } from "@riichi/core";
import { Button } from "@/ui/button";
import { AnnotatedShot } from "@/features/recognition/AnnotatedShot";
import { RecognitionWarnings } from "@/features/recognition/RecognitionWarnings";
import { HandEditor } from "@/features/settlement/hand/HandEditor";
import { isHandComplete, type ValueDraft } from "@/features/settlement/valueDraft";

/** 识别情况：带框的定格照 + 要动手的提示 + 可改的牌面。确认之前不算番，免得边改边跳。 */
export function CalcReview({
  shot,
  draft,
  onDraftChange,
  rules,
  isDealer,
  onRetake,
  onConfirm,
}: {
  shot: { photo: Blob; detections: Detection[] } | null;
  draft: ValueDraft;
  onDraftChange: (update: (d: ValueDraft) => ValueDraft) => void;
  rules: RoomRules;
  isDealer: boolean;
  onRetake: () => void;
  onConfirm: () => void;
}) {
  const complete = isHandComplete(draft.hand);
  return (
    <section className="space-y-3">
      {shot && <AnnotatedShot photo={shot.photo} detections={shot.detections} />}
      {draft.recognition && <RecognitionWarnings warnings={draft.recognition.warnings} />}
      <HandEditor
        draft={draft}
        onChange={onDraftChange}
        rules={rules}
        evaluated={null}
        evaluating={false}
        evalError={null}
        camera={null}
        showValue={false}
        isDealer={isDealer}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={onRetake}>
          <Camera className="h-5 w-5" />
          重新拍
        </Button>
        <Button
          variant="accent"
          size="lg"
          disabled={!complete}
          onClick={onConfirm}
          data-testid="calc-confirm"
        >
          <Check className="h-5 w-5" />
          识别正确
        </Button>
      </div>
      {!complete && <p className="text-center text-xs text-muted">把牌面补齐、指定和张后才能算</p>}
    </section>
  );
}
