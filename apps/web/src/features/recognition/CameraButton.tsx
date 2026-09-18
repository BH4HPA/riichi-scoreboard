import { useState } from "react";
import { Camera } from "lucide-react";
import type { RoomRules } from "@riichi/core";
import type { ValueDraft } from "@/features/settlement/valueDraft";
import { Button } from "@/ui/button";
import { useRoomStore } from "@/ws/store";
import { applyRecognized, attachRecognitionId } from "./applyRecognized";
import { CameraSheet, type Capture } from "./camera/CameraSheet";
import { RECOGNITION_MODEL } from "./modelUrl";
import { RecognitionWarnings } from "./RecognitionWarnings";
import { uploadRecognition } from "./recognize";

/**
 * 牌面页的拍照入口：打开全屏取景 → 对准手牌自动定格 → 结果灌进草稿（ValuePicker 随即算番）。
 * 推理在取景时就做完了，这里只负责把定格帧上传留存、把记录 id 挂回草稿，供结算确认后回填真值。
 */
export function CameraButton({
  draft,
  onChange,
  rules,
}: {
  draft: ValueDraft;
  onChange: (update: (d: ValueDraft) => ValueDraft) => void;
  rules: RoomRules;
}) {
  const [open, setOpen] = useState(false);

  if (!RECOGNITION_MODEL) return null;

  const onCapture = ({ blob, result }: Capture) => {
    setOpen(false);
    const key = uploadRecognition(blob, result, "room", {
      onId: (id) => onChange((d) => attachRecognitionId(d, key, id)),
      onFail: () => useRoomStore.getState().notify("error", "照片留存失败，不影响结算"),
    });
    onChange((d) => applyRecognized(d, result, rules, key));
  };

  const rec = draft.recognition;

  return (
    <div className="space-y-2" data-testid="recognize">
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setOpen(true)}
        data-testid="recognize-button"
      >
        <Camera className="mr-1 h-4 w-4" />
        {rec ? "重新拍照" : "拍照识别"}
      </Button>
      {rec && <RecognitionWarnings warnings={rec.warnings} />}
      {open && <CameraSheet rules={rules} onCapture={onCapture} onClose={() => setOpen(false)} />}
    </div>
  );
}
