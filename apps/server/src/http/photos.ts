import { randomBytes } from "node:crypto";
import { RECOGNITION_PHOTO_MAX_BYTES } from "@riichi/core";
import type { ObjectStore } from "../storage";
import { sniffImage } from "./avatars";

/** 识别照片：手机端裁剪过的定格帧 JPEG（编码时已按字节上限兜底），服务端只校验类型与大小。 */
export class PhotoError extends Error {
  constructor(
    public readonly code: "bad_photo",
    message: string,
  ) {
    super(message);
    this.name = "PhotoError";
  }
}

function datePart(now: number): string {
  return new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
}

export function validatePhoto(bytes: Uint8Array): void {
  if (bytes.byteLength === 0 || bytes.byteLength > RECOGNITION_PHOTO_MAX_BYTES) {
    throw new PhotoError("bad_photo", "照片需为不超过 2MB 的 JPEG");
  }
  if (sniffImage(bytes) !== "image/jpeg") throw new PhotoError("bad_photo", "照片需为 JPEG");
}

/** 校验 → 存对象；返回对象 key（不返回 URL：照片只供训练，不回显）。 */
export async function savePhoto(
  store: ObjectStore,
  playerId: string,
  bytes: Uint8Array,
  now = Date.now(),
): Promise<string> {
  validatePhoto(bytes);
  const key = `hands/${playerId}/${datePart(now)}-${randomBytes(6).toString("hex")}.jpg`;
  await store.put(key, bytes, "image/jpeg");
  return key;
}
