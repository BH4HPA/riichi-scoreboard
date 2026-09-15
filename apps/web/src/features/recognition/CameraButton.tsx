import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { RECOGNITION_MANIFEST, type RoomRules } from "@riichi/core";
import { useSession } from "@/api/session";
import type { ValueDraft } from "@/features/settlement/valueDraft";
import { Button } from "@/ui/button";
import { useRoomStore } from "@/ws/store";
import { applyRecognized } from "./applyRecognized";
import { CropDialog, type CroppedPhoto } from "./CropDialog";
import { recognizePhoto, type RecognizePhase } from "./recognize";

const PHASE_TEXT: Record<Exclude<RecognizePhase, "loading-model">, string> = {
  uploading: "识别中…",
  running: "识别中…",
};

/**
 * 牌面页顶部的拍照入口：选图 → 裁剪 → 本机识别 → 灌进草稿（随后 ValuePicker 自动算番）。
 * 模型通常已在进房间时预热好；没好就在这里显示下载进度。识别记录 id 挂在草稿上，结算确认后回填真值。
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<RecognizePhase | null>(null);
  const [progress, setProgress] = useState(0);
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => () => void (thumb && URL.revokeObjectURL(thumb)), [thumb]);

  if (!RECOGNITION_MANIFEST.model) return null;

  const run = async (photo: CroppedPhoto) => {
    setFile(null);
    setThumb(URL.createObjectURL(photo.blob));
    // 不用 crypto.randomUUID：它只在安全上下文可用，开发机是 HTTP
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    let id: string | null = null;
    const notify = useRoomStore.getState().notify;
    try {
      const { token } = await useSession.getState().ensure();
      setProgress(0);
      const result = await recognizePhoto(key, photo, token, {
        onPhase: setPhase,
        onProgress: setProgress,
        onId: (got) => {
          id = got;
          // 结果已灌入且是同一次运行时补上 id；否则由下面灌入时带上
          onChange((d) =>
            d.recognition?.key === key ? { ...d, recognition: { ...d.recognition, id: got } } : d,
          );
        },
      });
      onChange((d) => {
        const next = applyRecognized(d, result, rules, key);
        return { ...next, recognition: { ...next.recognition!, id } };
      });
    } catch (err) {
      notify("error", err instanceof Error ? `识别失败：${err.message}` : "识别失败");
    } finally {
      photo.bitmap.close();
      setPhase(null);
    }
  };

  const rec = draft.recognition;
  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5" data-testid="recognize">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={phase !== null}
          data-testid="recognize-button"
        >
          <Camera className="mr-1 h-4 w-4" />
          拍照识别
        </Button>
        {thumb && (
          <img src={thumb} alt="已识别的照片" className="ml-auto h-12 w-12 rounded object-cover" />
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="recognize-file"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (f) setFile(f);
        }}
      />
      <div className="text-xs text-muted" aria-live="polite" data-testid="recognize-status">
        {phase === "loading-model"
          ? `模型还在下载 ${Math.round(progress * 100)}%（约 25 MB，只下一次）`
          : phase
            ? PHASE_TEXT[phase]
            : rec
              ? `识别完成 · ${rec.ms} ms`
              : "拍下手牌、副露和宝牌指示牌，裁掉牌河，自动填入下方牌面"}
      </div>
      {phase === "loading-model" && (
        <div className="h-1 w-full overflow-hidden rounded bg-surface-2">
          <div
            className="h-full bg-accent transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
      {rec && rec.warnings.length > 0 && (
        <ul className="space-y-0.5 text-xs text-neg">
          {rec.warnings.map((w, i) => (
            <li key={i}>{w.message}</li>
          ))}
        </ul>
      )}
      <CropDialog file={file} onConfirm={run} onCancel={() => setFile(null)} />
    </div>
  );
}
