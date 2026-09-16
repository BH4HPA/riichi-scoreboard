import { useState } from "react";
import { Camera } from "lucide-react";
import { RECOGNITION_MANIFEST, type RoomRules } from "@riichi/core";
import { useSession } from "@/api/session";
import type { ValueDraft } from "@/features/settlement/valueDraft";
import { Button } from "@/ui/button";
import { canUseCamera } from "@/lib/device";
import { useRoomStore } from "@/ws/store";
import { applyRecognized } from "./applyRecognized";
import { CameraSheet, type Capture } from "./camera/CameraSheet";
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

  if (!RECOGNITION_MANIFEST.model) return null;

  const onCapture = ({ blob, result }: Capture) => {
    setOpen(false);
    // 不用 crypto.randomUUID：它只在安全上下文可用，开发机是 HTTP
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    onChange((d) => applyRecognized(d, result, rules, key));
    void useSession
      .getState()
      .ensure()
      .then(({ token }) =>
        uploadRecognition(key, blob, result, token, "room", (id) =>
          onChange((d) =>
            d.recognition?.key === key ? { ...d, recognition: { ...d.recognition, id } } : d,
          ),
        ),
      )
      .catch(() => useRoomStore.getState().notify("error", "照片留存失败，不影响结算"));
  };

  const rec = draft.recognition;
  const blocking = rec?.warnings.filter((w) => w.severity === "blocking") ?? [];
  const usable = canUseCamera();

  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5" data-testid="recognize">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={!usable}
          data-testid="recognize-button"
        >
          <Camera className="mr-1 h-4 w-4" />
          拍照识别
        </Button>
      </div>
      <div className="text-xs text-muted" aria-live="polite" data-testid="recognize-status">
        {!usable
          ? "相机需要 HTTPS 才能打开，请用正式地址访问"
          : rec
            ? `识别完成 · ${rec.ms} ms`
            : "对准手牌、副露和宝牌指示牌，稳住约一秒自动定格"}
      </div>
      {/* 只报用户此刻能动手的：结果自洽时模型的内务（丢了几个低置信框之类）对用户零价值 */}
      {blocking.length > 0 && (
        <ul className="space-y-0.5 text-xs text-neg">
          {blocking.map((w, i) => (
            <li key={i}>{w.message}</li>
          ))}
        </ul>
      )}
      {open && <CameraSheet rules={rules} onCapture={onCapture} onClose={() => setOpen(false)} />}
    </div>
  );
}
