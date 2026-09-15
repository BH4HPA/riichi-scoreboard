import type { RecognitionCreated, RecognitionPatch } from "@riichi/core";
import { api } from "@/api/client";

/** 上传裁剪后的照片并建记录；infer = 让服务器引擎识别（未启用时抛 ApiError 503）。 */
export function createRecognition(
  blob: Blob,
  token: string,
  infer: boolean,
): Promise<RecognitionCreated> {
  return api<RecognitionCreated>(`/api/recognitions${infer ? "?infer=1" : ""}`, {
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
