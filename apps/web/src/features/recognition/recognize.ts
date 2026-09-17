import type { RecognitionResult, RecognitionSource } from "@riichi/core";
import type { ValueDraft } from "@/features/settlement/valueDraft";
import { createRecognition, patchRecognition } from "./api";

/**
 * 每次识别的上传 Promise，按运行 key 记着：确认时若 id 还没回来就等它，真值不丢。
 * 确认后不删：同一张可能再确认一次（算点数页「返回修改」后），那时草稿里的 id 可能仍是 null。
 * 只在上传失败时删；一条就是一个已决的 Promise，页面生命周期内攒不出量。
 */
const uploads = new Map<string, Promise<string>>();

/**
 * 定格之后的留存：上传照片建记录，再把检测框与识别结果回填。推理已经在取景时做完了，
 * 这里只管 I/O，全程 fire-and-forget —— 上传失败不该打断用户结算。
 * 照片就是推理的那一帧（Worker 编码回来的），所以照片与 detections 严格对齐。
 */
export function uploadRecognition(
  key: string,
  blob: Blob,
  result: RecognitionResult,
  token: string,
  source: RecognitionSource,
  onId?: (id: string) => void,
  /** 上传失败要能被看见：否则记录 id 永远为 null，界面上就永远等不到它 */
  onFail?: (message: string) => void,
): void {
  const upload = createRecognition(blob, token, source).then((created) => {
    onId?.(created.id);
    return created.id;
  });
  uploads.set(key, upload);
  upload.catch((err: unknown) => {
    uploads.delete(key);
    onFail?.(err instanceof Error ? err.message : "照片上传失败");
  });
  void upload
    .then((id) =>
      patchRecognition(
        id,
        {
          modelId: result.modelId,
          ms: result.ms,
          detections: result.detections,
          recognized: result.hand,
        },
        token,
      ),
    )
    .catch(() => undefined);
}

/**
 * 用户确认之后（房间里是结算命令被接受，算点数页是「识别正确」）：把最终手牌回填为真值（上传还没回来就等它）。
 * 返回的 Promise 只会 resolve：同一张照片可能被确认多次，调用方据此串行，免得旧的回填后到把新的盖掉。
 */
export function confirmRecognized(draft: ValueDraft, token: string | null): Promise<void> {
  const rec = draft.recognition;
  if (draft.mode !== "hand" || !rec || !token) return Promise.resolve();
  const id = rec.id ? Promise.resolve(rec.id) : uploads.get(rec.key);
  if (!id) return Promise.resolve();
  return id
    .then((i) => patchRecognition(i, { corrected: draft.hand }, token))
    .catch(() => undefined);
}
