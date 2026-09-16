/** 取景带占屏高的比例：默认 45%，可拖 25%–70%（用户拍板） */
export const BAND_DEFAULT = 0.45;
export const BAND_MIN = 0.25;
export const BAND_MAX = 0.7;

/**
 * 画出来的引导线比实际裁剪框窄一圈（画 90%，即默认 45% 裁 / 40.5% 画）。
 * 骑在裁剪边上的牌会被裁成半张，`unletterbox` 把框裁回图内之后成了异常宽高比，
 * 被 `odd_box` 静默丢掉 → 合计凑不满 14 张 → 自动定格永远不触发，而用户不知道为什么。
 * 内缩给的就是这点容错余量。
 */
export const GUIDE_RATIO = 0.9;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  /** 视频原始像素 */
  videoWidth: number;
  videoHeight: number;
  /** 元素在屏幕上的尺寸（`object-cover` 填满） */
  displayWidth: number;
  displayHeight: number;
}

export function clampBand(fraction: number): number {
  return Math.min(BAND_MAX, Math.max(BAND_MIN, fraction));
}

/**
 * 取景带 → 视频原始像素的矩形，用于 `createImageBitmap(video, sx, sy, sw, sh)`。
 * 元素是 `object-cover`：视频按长边铺满、两侧等量裁掉，所以先按 max 求缩放再去掉居中偏移。
 * 结果夹到画面内；尺寸退化（元素还没布局、视频还没解码）时返回 null。
 */
export function bandRect(view: Viewport, fraction: number): Rect | null {
  const { videoWidth: vw, videoHeight: vh, displayWidth: dw, displayHeight: dh } = view;
  if (vw <= 0 || vh <= 0 || dw <= 0 || dh <= 0) return null;
  const scale = Math.max(dw / vw, dh / vh);
  const offsetX = (dw - vw * scale) / 2;
  const offsetY = (dh - vh * scale) / 2;
  const bandH = dh * clampBand(fraction);
  const bandY = (dh - bandH) / 2;
  const x = Math.max(0, (0 - offsetX) / scale);
  const y = Math.max(0, (bandY - offsetY) / scale);
  const width = Math.min(vw - x, dw / scale);
  const height = Math.min(vh - y, bandH / scale);
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}
