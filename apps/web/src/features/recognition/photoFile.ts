/** 照片从选择到送入模型的图像处理：解码（含 EXIF 方向）、裁剪、缩放、编码。 */

/** 裁剪后长边上限：训练输入 640，留一倍余量给检测框回填与留存 */
export const PHOTO_MAX_EDGE = 1280;

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 解码照片；`imageOrientation: "from-image"` 让 iOS 竖拍的 EXIF 方向落到像素上。
 * 旧浏览器不认这个枚举值会抛 TypeError，退回默认行为（它们本就按 EXIF 方向解码）。
 */
export async function loadPhoto(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (err) {
    if (err instanceof TypeError) return createImageBitmap(file);
    throw err;
  }
}

/** 按矩形裁剪并把长边缩到 PHOTO_MAX_EDGE 以内，输出 JPEG 与同尺寸的位图（推理复用，免二次解码）。 */
export async function cropPhoto(
  bitmap: ImageBitmap,
  rect: CropRect,
): Promise<{ blob: Blob; bitmap: ImageBitmap }> {
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(rect.width, rect.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("无法生成图片"))), "image/jpeg", 0.85),
  );
  return { blob, bitmap: await createImageBitmap(canvas) };
}
