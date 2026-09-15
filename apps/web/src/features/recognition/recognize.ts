import type { RecognitionEngine, RecognitionResult } from "@riichi/core";
import { ApiError } from "@/api/client";
import type { ValueDraft } from "@/features/settlement/valueDraft";
import { createRecognition, patchRecognition } from "./api";
import { recognizeInBrowser, type BrowserPhase } from "./browserEngine";

export type RecognizePhase = "uploading" | BrowserPhase | "server";

export interface RecognizeHooks {
  onPhase?: (phase: RecognizePhase) => void;
  /** 上传完成，拿到记录 id（与推理并行，可能先于或晚于结果） */
  onId?: (id: string) => void;
  /** 服务器引擎不可用，已改用本机 */
  onFallback?: () => void;
}

/**
 * 一次识别的编排：
 * - 本机引擎：上传照片与本机推理并行；结果先回给调用方，再把检测框回填到记录。
 * - 服务器引擎：`?infer=1` 一次完成；503（未启用）→ 回退本机。
 * 回填是 fire-and-forget：失败不影响用户流程。
 */
export async function recognizePhoto(
  photo: { blob: Blob; bitmap: ImageBitmap },
  engine: RecognitionEngine,
  token: string,
  hooks: RecognizeHooks = {},
): Promise<RecognitionResult> {
  if (engine === "server") {
    hooks.onPhase?.("server");
    try {
      const created = await createRecognition(photo.blob, token, true);
      hooks.onId?.(created.id);
      if (created.result) return created.result;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 503)) throw err;
      hooks.onFallback?.();
    }
  }
  hooks.onPhase?.("uploading");
  const upload = createRecognition(photo.blob, token, false).then((created) => {
    hooks.onId?.(created.id);
    return created.id;
  });
  const result = await recognizeInBrowser(photo.bitmap, (p) => hooks.onPhase?.(p));
  void upload
    .then((id) =>
      patchRecognition(
        id,
        {
          engine: "browser",
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

/** 结算命令被接受后：把用户最终提交的手牌回填为真值。 */
export function confirmRecognized(draft: ValueDraft, token: string | null): void {
  const id = draft.recognition?.id;
  if (draft.mode !== "hand" || !id || !token) return;
  void patchRecognition(id, { corrected: draft.hand }, token).catch(() => undefined);
}
