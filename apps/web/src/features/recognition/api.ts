import type {
  RecognitionCreated,
  RecognitionPatch,
  RecognitionSampleMeta,
  RecognitionSessionSummary,
  RecognitionSource,
} from "@riichi/core";
import { api } from "@/api/client";

/** 上传定格帧并建记录（照片留作训练数据）。来源与会话走 query：请求体已被裸 JPEG 占用。 */
export function createRecognition(
  blob: Blob,
  token: string,
  source: RecognitionSource,
  session: string,
): Promise<RecognitionCreated> {
  return api<RecognitionCreated>(`/api/recognitions?source=${source}&session=${session}`, {
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

/**
 * 一帧采样（整幅画面 + 元数据），multipart。不 keepalive：浏览器限 64 KB，带不了照片；
 * 所以只在取景页正常关闭时发，关标签页就只剩摘要。
 */
export function uploadRecognitionSample(
  session: string,
  seq: number,
  photo: Blob,
  meta: RecognitionSampleMeta,
  token: string,
): Promise<void> {
  const form = new FormData();
  form.append("photo", photo, `${seq}.jpg`);
  form.append("meta", JSON.stringify(meta));
  return api<void>(`/api/recognition-sessions/${session}/samples/${seq}`, {
    method: "POST",
    raw: form,
    token,
  });
}
