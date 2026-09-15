import type { RecognitionEngine, RecognitionResult } from "@riichi/core";
import { ApiError } from "@/api/client";
import type { ValueDraft } from "@/features/settlement/valueDraft";
import { createRecognition, patchRecognition } from "./api";
import { recognizeInBrowser, type BrowserPhase } from "./browserEngine";

export type RecognizePhase = "uploading" | BrowserPhase | "server";

export interface RecognizeHooks {
  onPhase?: (phase: RecognizePhase) => void;
  /** 首次加载模型与运行时的下载进度 0–1 */
  onProgress?: (fraction: number) => void;
  /** 上传完成，拿到记录 id（与推理并行，可能先于或晚于结果） */
  onId?: (id: string) => void;
  /** 服务器引擎不可用，已改用本机 */
  onFallback?: () => void;
}

/** 每次识别的上传 Promise，按运行 key 记着：结算确认时若 id 还没回来就等它，真值不丢。 */
const uploads = new Map<string, Promise<string>>();

/**
 * 一次识别的编排：
 * - 本机引擎：上传照片与本机推理并行；结果先回给调用方，再把检测框回填到记录。
 * - 服务器引擎：`?infer=1` 一次完成；503（未启用）→ 回退本机并重新上传；201 但结果为空（引擎忙）→
 *   复用同一条记录做本机推理。
 * 回填是 fire-and-forget：失败不影响用户流程。
 */
export async function recognizePhoto(
  key: string,
  photo: { blob: Blob; bitmap: ImageBitmap },
  engine: RecognitionEngine,
  token: string,
  hooks: RecognizeHooks = {},
): Promise<RecognitionResult> {
  let upload: Promise<string> | null = null;
  if (engine === "server") {
    hooks.onPhase?.("server");
    try {
      const created = await createRecognition(photo.blob, token, true);
      upload = Promise.resolve(created.id);
      uploads.set(key, upload);
      hooks.onId?.(created.id);
      if (created.result) return created.result;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 503)) throw err;
      hooks.onFallback?.();
    }
  }
  if (!upload) {
    hooks.onPhase?.("uploading");
    upload = createRecognition(photo.blob, token, false).then((created) => {
      hooks.onId?.(created.id);
      return created.id;
    });
    uploads.set(key, upload);
    upload.catch(() => uploads.delete(key));
  }
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
          engine: "browser",
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
