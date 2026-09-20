import { letterboxGeometry, type Box, type LetterboxGeometry } from "@riichi/core";
import { sourceBox, uprightAngle, type Rotation } from "../camera/orientation/upright";

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

type Ctx = OffscreenCanvasRenderingContext2D;

/**
 * 把**正立帧**里的一块画到画布的 (dx, dy, dw, dh)：位图本身可能是躺着的，
 * 取它对应的那一块、绕目标矩形中心转正，裁剪与旋转一次 drawImage 完成。
 */
export function drawUpright(
  c: Ctx,
  bitmap: ImageBitmap,
  crop: Box,
  rotation: Rotation,
  dest: { x: number; y: number; width: number; height: number },
): void {
  const [sx1, sy1, sx2, sy2] = sourceBox(crop, rotation, bitmap);
  const [sw, sh] = [sx2 - sx1, sy2 - sy1];
  // 转 90° 后源块的宽对着目标的高
  const [w, h] = rotation === 0 ? [dest.width, dest.height] : [dest.height, dest.width];
  c.save();
  c.translate(dest.x + dest.width / 2, dest.y + dest.height / 2);
  c.rotate(uprightAngle(rotation));
  c.drawImage(bitmap, sx1, sy1, sw, sh, -w / 2, -h / 2, w, h);
  c.restore();
}

/** crop 是正立帧里的一块；geom 是**这一块**的 letterbox：解码出来的框是块内坐标，调用方再加上块的偏移 */
export function toModelInput(
  bitmap: ImageBitmap,
  crop: Box,
  rotation: Rotation,
  size: number,
): { data: Float32Array; geom: LetterboxGeometry } {
  const [w, h] = [crop[2] - crop[0], crop[3] - crop[1]];
  const geom = letterboxGeometry(w, h, size);
  const c = surface(size);
  c.fillStyle = "rgb(114,114,114)";
  c.fillRect(0, 0, size, size);
  drawUpright(c, bitmap, crop, rotation, {
    x: geom.padX,
    y: geom.padY,
    width: Math.round(w * geom.scale),
    height: Math.round(h * geom.scale),
  });
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
