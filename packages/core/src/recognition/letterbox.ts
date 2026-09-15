import type { Detection } from "./types";

/** 把 width×height 的图等比缩放后居中放进 size×size 的正方形（与 ultralytics letterbox 一致）。 */
export interface LetterboxGeometry {
  scale: number;
  padX: number;
  padY: number;
  size: number;
  width: number;
  height: number;
}

export function letterboxGeometry(width: number, height: number, size = 640): LetterboxGeometry {
  const scale = size / Math.max(width, height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return {
    scale,
    padX: Math.floor((size - w) / 2),
    padY: Math.floor((size - h) / 2),
    size,
    width,
    height,
  };
}

/** letterbox 坐标 → 原图坐标，并裁到图内。 */
export function unletterbox(
  box: readonly [number, number, number, number],
  g: LetterboxGeometry,
): [number, number, number, number] {
  const clampX = (v: number) => Math.min(g.width, Math.max(0, (v - g.padX) / g.scale));
  const clampY = (v: number) => Math.min(g.height, Math.max(0, (v - g.padY) / g.scale));
  return [clampX(box[0]), clampY(box[1]), clampX(box[2]), clampY(box[3])];
}

/**
 * 解析端到端导出（nms=True）的输出 `[1, 300, 6]` = x1 y1 x2 y2 conf cls（letterbox 坐标，零填充到 300 行）。
 * 遇到 conf 为 0 即停止；类 id 越界或框退化的行丢弃。
 */
export function decodeNmsOutput(
  data: ArrayLike<number>,
  g: LetterboxGeometry,
  classCount: number,
  maxRows = 300,
): Detection[] {
  const out: Detection[] = [];
  for (let i = 0; i < maxRows; i++) {
    const base = i * 6;
    const conf = data[base + 4];
    if (conf === undefined || !(conf > 0)) break;
    const cls = Math.round(data[base + 5] ?? -1);
    if (cls < 0 || cls >= classCount) continue;
    const box = unletterbox(
      [data[base] ?? 0, data[base + 1] ?? 0, data[base + 2] ?? 0, data[base + 3] ?? 0],
      g,
    );
    if (box[2] <= box[0] || box[3] <= box[1]) continue;
    out.push({ cls, conf, box });
  }
  return out;
}
