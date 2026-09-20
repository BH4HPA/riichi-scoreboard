import type {
  RecognitionCreated,
  RecognitionPatch,
  RecognitionSessionSummary,
  RecognitionSource,
} from "@riichi/core";
import { api } from "@/api/client";

/** 上传定格帧并建记录（照片留作训练数据）。来源走 query：请求体已被裸 JPEG 占用。 */
export function createRecognition(
  blob: Blob,
  token: string,
  source: RecognitionSource,
): Promise<RecognitionCreated> {
  return api<RecognitionCreated>(`/api/recognitions?source=${source}`, {
    method: "POST",
    raw: blob,
    token,
  });
}

export function patchRecognition(
  id: string,
  patch: RecognitionPatch,
  token: string,
): Promise<void> {
  return api<void>(`/api/recognitions/${id}`, { method: "PATCH", body: patch, token });
}

/** 取景会话摘要：页面可能正在卸载，所以 keepalive；发不出去就算了 */
export function reportRecognitionSession(
  summary: RecognitionSessionSummary,
  token: string,
): Promise<void> {
  return api<void>("/api/recognition-sessions", {
    method: "POST",
    body: summary,
    token,
    keepalive: true,
  });
}
