import { letterboxGeometry, type Box, type LetterboxGeometry } from "@riichi/core";

/**
 * 位图里的一块 → 模型输入：letterbox 到 size×size（灰 114 补边），RGB/255，CHW 排列。
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

/** geom 是**这一块**的 letterbox：解码出来的框是块内坐标，调用方再加上块的偏移 */
export function toModelInput(
  bitmap: ImageBitmap,
  crop: Box,
  size: number,
): { data: Float32Array; geom: LetterboxGeometry } {
  const [x1, y1, x2, y2] = crop;
  const [w, h] = [x2 - x1, y2 - y1];
  const geom = letterboxGeometry(w, h, size);
  const c = surface(size);
  c.fillStyle = "rgb(114,114,114)";
  c.fillRect(0, 0, size, size);
  c.drawImage(
    bitmap,
    x1,
    y1,
    w,
    h,
    geom.padX,
    geom.padY,
    Math.round(w * geom.scale),
    Math.round(h * geom.scale),
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
