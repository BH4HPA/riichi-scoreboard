import type { RecognitionResult } from "@riichi/core";
import type { ValueDraft } from "@/features/settlement/valueDraft";
import { createRecognition, patchRecognition } from "./api";
import { recognizeInBrowser, type BrowserPhase } from "./browserEngine";

export type RecognizePhase = "uploading" | BrowserPhase;

export interface RecognizeHooks {
  onPhase?: (phase: RecognizePhase) => void;
  /** 模型与运行时还没下载完时的进度 0–1 */
  onProgress?: (fraction: number) => void;
  /** 上传完成，拿到记录 id（与推理并行，可能先于或晚于结果） */
  onId?: (id: string) => void;
}

/** 每次识别的上传 Promise，按运行 key 记着：结算确认时若 id 还没回来就等它，真值不丢。 */
const uploads = new Map<string, Promise<string>>();

/**
 * 一次识别的编排：上传照片与本机推理并行；结果先回给调用方，再把检测框回填到记录。
 * 回填是 fire-and-forget：失败不影响用户流程。
 */
export async function recognizePhoto(
  key: string,
  photo: { blob: Blob; bitmap: ImageBitmap },
  token: string,
  hooks: RecognizeHooks = {},
): Promise<RecognitionResult> {
  hooks.onPhase?.("uploading");
  const upload = createRecognition(photo.blob, token).then((created) => {
    hooks.onId?.(created.id);
    return created.id;
  });
  uploads.set(key, upload);
  upload.catch(() => uploads.delete(key));
  const result = await recognizeInBrowser(
    photo.bitmap,
    (p) => hooks.onPhase?.(p),
    (f) => hooks.onProgress?.(f),
  );
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
  return result;
}

/** 结算命令被接受后：把用户最终提交的手牌回填为真值（上传还没回来就等它）。 */
export function confirmRecognized(draft: ValueDraft, token: string | null): void {
  const rec = draft.recognition;
  if (draft.mode !== "hand" || !rec || !token) return;
  const id = rec.id ? Promise.resolve(rec.id) : uploads.get(rec.key);
  if (!id) return;
  void id
    .then((i) => patchRecognition(i, { corrected: draft.hand }, token))
    .catch(() => undefined)
    .finally(() => uploads.delete(rec.key));
}
