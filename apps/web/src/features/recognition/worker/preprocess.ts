import { letterboxGeometry, type LetterboxGeometry } from "@riichi/core";

/**
 * 位图 → 模型输入：letterbox 到 size×size（灰 114 补边），RGB/255，CHW 排列。
 * 在 Worker 里跑，所以用 `OffscreenCanvas` 而不是 `document.createElement`。
 * 画布与输出缓冲按尺寸复用：取景框每秒要跑三四次，逐帧新建 640×640 画布与 1.2 MB 的
 * Float32Array 会把 GC 压出可见的掉帧。
 */
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let buffer: Float32Array | null = null;

function surface(size: number): OffscreenCanvasRenderingContext2D {
  if (!canvas || canvas.width !== size || canvas.height !== size) {
    canvas = new OffscreenCanvas(size, size);
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  return ctx!;
}

export function toModelInput(
  bitmap: ImageBitmap,
  size: number,
): { data: Float32Array; geom: LetterboxGeometry } {
  const geom = letterboxGeometry(bitmap.width, bitmap.height, size);
  const c = surface(size);
  c.fillStyle = "rgb(114,114,114)";
  c.fillRect(0, 0, size, size);
  c.drawImage(
    bitmap,
    geom.padX,
    geom.padY,
    Math.round(bitmap.width * geom.scale),
    Math.round(bitmap.height * geom.scale),
  );
  const { data: rgba } = c.getImageData(0, 0, size, size);
  const plane = size * size;
  if (!buffer || buffer.length !== 3 * plane) buffer = new Float32Array(3 * plane);
  const data = buffer;
  for (let i = 0; i < plane; i++) {
    data[i] = rgba[i * 4]! / 255;
    data[plane + i] = rgba[i * 4 + 1]! / 255;
    data[2 * plane + i] = rgba[i * 4 + 2]! / 255;
  }
  return { data, geom };
}
