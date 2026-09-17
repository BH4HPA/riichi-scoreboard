import { useCallback, useState } from "react";
import { Camera } from "lucide-react";
import { Link } from "react-router";
import { MLEAGUE_RULES, type Detection } from "@riichi/core";
import { useSession } from "@/api/session";
import { Button } from "@/ui/button";
import { Notice } from "@/ui/notice";
import { canUseCamera } from "@/lib/device";
import { AnnotatedShot } from "@/features/recognition/AnnotatedShot";
import { CameraSheet, type Capture } from "@/features/recognition/camera/CameraSheet";
import { applyRecognized } from "@/features/recognition/applyRecognized";
import { patchRecognition } from "@/features/recognition/api";
import { uploadRecognition } from "@/features/recognition/recognize";
import { HandEditor } from "@/features/settlement/hand/HandEditor";
import { createValueDraft, type ValueDraft } from "@/features/settlement/valueDraft";
import { useRoomStore } from "@/ws/store";

/**
 * 标注固定用 M-League：杠宝、里宝都开，指示牌不会被截；赤五是赤 3（每色一张），
 * 认出超额的赤五会被折回并打「请核对」记号，回流时这类记录送人工
 */
const RULES = MLEAGUE_RULES;
/**
 * 给模型标牌：不进房间，取景 → 定格 → 改到全对 → 「就是这手」把真值传回去。
 * 与房间里那条路共用取景框和牌面编辑器，区别只有两个——多画检测框与牌图标签、
 * 提交的是训练真值而不是结算命令。提交完自动回到取景接着拍：连拍的手感就是这个页面的全部价值。
 */
export function Calc() {
  const [shooting, setShooting] = useState(false);
  const [draft, setDraft] = useState<ValueDraft>(() => createValueDraft(false, "hand"));
  /** 这一张的定格帧与检测框：确认界面回看用，提交后清掉 */
  const [shot, setShot] = useState<{ photo: Blob; detections: Detection[] } | null>(null);
  const [saved, setSaved] = useState(0);
  const notify = useRoomStore((s) => s.notify);

  const onCapture = useCallback(({ blob, result }: Capture) => {
    setShooting(false);
    setShot({ photo: blob, detections: result.detections });
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    setDraft((d) => applyRecognized(d, result, RULES, key));
    void useSession
      .getState()
      .ensure()
      .then(({ token }) =>
        uploadRecognition(
          key,
          blob,
          result,
          token,
          "label",
          (id) =>
            setDraft((d) =>
              d.recognition?.key === key ? { ...d, recognition: { ...d.recognition, id } } : d,
            ),
          (message) =>
            useRoomStore.getState().notify("error", `照片上传失败（${message}），这张先不算`),
        ),
      )
      .catch(() => useRoomStore.getState().notify("error", "照片上传失败，这张先不算"));
  }, []);

  const submit = async () => {
    const rec = draft.recognition;
    if (!rec?.id) return notify("error", "照片还在上传，稍等一下");
    try {
      const { token } = await useSession.getState().ensure();
      await patchRecognition(rec.id, { corrected: draft.hand }, token);
    } catch {
      return notify("error", "提交失败，这张先留着再试一次");
    }
    setSaved((n) => n + 1);
    setDraft(createValueDraft(false, "hand"));
    setShot(null);
    notify("info", "已记下，接着拍");
    setShooting(true);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">给模型标牌</h1>
        <Link to="/" className="text-sm text-muted underline-offset-2 hover:underline">
          返回首页
        </Link>
      </div>
      <p className="text-sm text-muted">
        拍一手牌，把认错的改对，提交的就是训练真值。本页不进房间，也不影响任何牌局。
        {saved > 0 && ` 本次已提交 ${saved} 张。`}
      </p>

      {!canUseCamera() ? (
        <p className="text-sm text-neg">相机需要 HTTPS 才能打开，请用正式地址访问本页。</p>
      ) : (
        <Button variant="accent" size="lg" onClick={() => setShooting(true)}>
          <Camera className="mr-1 h-5 w-5" />
          {draft.recognition ? "再拍一张" : "开始拍"}
        </Button>
      )}

      {draft.recognition && (
        <>
          {shot && <AnnotatedShot photo={shot.photo} detections={shot.detections} />}
          <HandEditor
            draft={draft}
            onChange={(update) => setDraft(update)}
            rules={RULES}
            evaluated={null}
            evaluating={false}
            evalError={null}
            camera={null}
            showValue={false}
            isDealer={null}
          />
          <Button variant="accent" onClick={() => void submit()} data-testid="label-submit">
            就是这手
          </Button>
        </>
      )}

      {shooting && (
        <CameraSheet
          rules={RULES}
          mode="calc"
          onCapture={onCapture}
          onClose={() => setShooting(false)}
        />
      )}
      <Notice />
    </main>
  );
}
