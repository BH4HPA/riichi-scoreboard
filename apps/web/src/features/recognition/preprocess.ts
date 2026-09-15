import { letterboxGeometry, type LetterboxGeometry } from "@riichi/core";

/** 位图 → 模型输入：letterbox 到 size×size（灰 114 补边），RGB/255，CHW 排列。 */
export function toModelInput(
  bitmap: ImageBitmap,
  size: number,
): { data: Float32Array; geom: LetterboxGeometry } {
  const geom = letterboxGeometry(bitmap.width, bitmap.height, size);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(
    bitmap,
    geom.padX,
    geom.padY,
    Math.round(bitmap.width * geom.scale),
    Math.round(bitmap.height * geom.scale),
  );
  const { data: rgba } = ctx.getImageData(0, 0, size, size);
  const plane = size * size;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    data[i] = rgba[i * 4]! / 255;
    data[plane + i] = rgba[i * 4 + 1]! / 255;
    data[2 * plane + i] = rgba[i * 4 + 2]! / 255;
  }
  return { data, geom };
}
