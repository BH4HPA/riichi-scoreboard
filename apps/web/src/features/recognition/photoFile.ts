/** 相册里挑出来的照片如何解码。取景框那条路不经过这里（帧直接来自视频）。 */

/** 裁剪后长边上限：训练输入 640，留一倍余量给检测框回填与留存 */
export const PHOTO_MAX_EDGE = 1280;

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
