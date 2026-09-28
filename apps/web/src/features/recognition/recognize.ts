import type { RecognitionResult, RecognitionSource } from "@riichi/core";
import { useSession } from "@/api/session";
import type { ValueDraft } from "@/features/settlement/valueDraft";
import { newId } from "@/lib/utils";
import { createRecognition, patchRecognition } from "./api";

/**
 * 每次识别的上传 Promise，按运行 key 记着：确认时若 id 还没回来就等它，真值不丢。
 * 确认后不删：同一张可能再确认一次（算点数页「返回修改」后），那时草稿里的 id 可能仍是 null。
 * 只在上传失败时删；一条就是一个已决的 Promise，页面生命周期内攒不出量。
 */
const uploads = new Map<string, Promise<string>>();

/**
 * 每次取景定格照的上传，按会话 id 记着：采样帧要等它传完再传，定格照（有真值的那张）优先。
 * 由会话收尾时取走（takeCaptureUpload），不会越攒越多。
 */
const captureUploads = new Map<string, Promise<unknown>>();

/** 取走这次取景定格照的上传（没定格就是已决的空 Promise）；只会 resolve */
export function takeCaptureUpload(session: string): Promise<unknown> {
  const upload = captureUploads.get(session);
  captureUploads.delete(session);
  return upload?.catch(() => undefined) ?? Promise.resolve();
}

/**
 * 定格之后的留存：上传照片建记录，再把检测框与识别结果回填。推理已经在取景时做完了，
 * 这里只管 I/O，全程 fire-and-forget —— 上传失败不该打断用户结算。
 * 照片就是推理的那一帧（Worker 编码回来的），所以照片与 detections 严格对齐。
 * 返回本次运行的 key，同步登记在 uploads 里：会话还没建好时用户就确认也等得到 id。
 */
export function uploadRecognition(
  capture: { blob: Blob; result: RecognitionResult; session: string },
  source: RecognitionSource,
  hooks: { onId: (id: string) => void; onFail: (message: string) => void },
): string {
  const { blob, result } = capture;
  const key = newId();
  const session = useSession.getState().ensure();
  const upload = session
    .then(({ token }) => createRecognition(blob, token, source, capture.session))
    .then((created) => {
      hooks.onId(created.id);
      return created.id;
    });
  uploads.set(key, upload);
  captureUploads.set(capture.session, upload);
  upload.catch((err: unknown) => {
    uploads.delete(key);
    hooks.onFail(err instanceof Error ? err.message : "照片上传失败");
  });
  void Promise.all([upload, session])
    .then(([id, { token }]) =>
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
  return key;
}

/**
 * 用户确认之后（房间里是结算命令被接受，算点数页是「识别正确」）：把最终手牌回填为真值（上传还没回来就等它）。
 * 返回的 Promise 只会 resolve：同一张照片可能被确认多次，调用方据此串行，免得旧的回填后到把新的盖掉。
 */
export function confirmRecognized(draft: ValueDraft): Promise<void> {
  const rec = draft.recognition;
  if (draft.mode !== "hand" || !rec) return Promise.resolve();
  const id = rec.id ? Promise.resolve(rec.id) : uploads.get(rec.key);
  if (!id) return Promise.resolve();
  return Promise.all([id, useSession.getState().ensure()])
    .then(([i, { token }]) => patchRecognition(i, { corrected: draft.hand }, token))
    .catch(() => undefined);
}
