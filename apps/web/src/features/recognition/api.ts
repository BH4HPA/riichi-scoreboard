import type { RecognitionCreated, RecognitionPatch, RecognitionSource } from "@riichi/core";
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
