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
  /** 视频（或照片）原始像素 */
  videoWidth: number;
  videoHeight: number;
  /** 取景区域在屏幕上的尺寸 */
  displayWidth: number;
  displayHeight: number;
  /** 画面怎么放进取景区域：实时视频铺满裁边（cover），相册照片完整显示（contain）。默认 cover */
  fit?: "cover" | "contain";
}

export function clampBand(fraction: number): number {
  return Math.min(BAND_MAX, Math.max(BAND_MIN, fraction));
}

/** 取景带中线的位置（占取景区域高度的比例）：整条带不能出界 */
export function clampCenter(center: number, fraction: number): number {
  const half = clampBand(fraction) / 2;
  return Math.min(1 - half, Math.max(half, center));
}

/** 画面在取景区域里的实际摆放（像素）：cover 铺满居中裁边，contain 完整居中留边 */
export function fitBox(view: Viewport): { scale: number; left: number; top: number } | null {
  const { videoWidth: vw, videoHeight: vh, displayWidth: dw, displayHeight: dh } = view;
  if (vw <= 0 || vh <= 0 || dw <= 0 || dh <= 0) return null;
  const scale = (view.fit === "contain" ? Math.min : Math.max)(dw / vw, dh / vh);
  return { scale, left: (dw - vw * scale) / 2, top: (dh - vh * scale) / 2 };
}

/**
 * 取景带 → 原始像素的矩形，用于 `createImageBitmap(src, sx, sy, sw, sh)`。
 * 先按 fitBox 求缩放与居中偏移，再把带的上下沿、区域的左右沿换算回原始像素并夹到画面内；
 * `center` 是带中线的位置（实时取景固定居中，相册照片可以拖）。尺寸退化时返回 null。
 */
export function bandRect(view: Viewport, fraction: number, center = 0.5): Rect | null {
  const box = fitBox(view);
  if (!box) return null;
  const { videoWidth: vw, videoHeight: vh, displayWidth: dw, displayHeight: dh } = view;
  const bandH = dh * clampBand(fraction);
  const bandTop = dh * clampCenter(center, fraction) - bandH / 2;
  const toX = (px: number) => Math.min(vw, Math.max(0, (px - box.left) / box.scale));
  const toY = (px: number) => Math.min(vh, Math.max(0, (px - box.top) / box.scale));
  const x = toX(0);
  const y = toY(bandTop);
  const width = toX(dw) - x;
  const height = toY(bandTop + bandH) - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/**
 * 检测框（裁剪后那一帧的像素坐标）→ 覆盖层里的百分比定位。
 * 覆盖层与裁剪区域同一块矩形，所以直接按比例换算；退化的裁剪尺寸返回 null。
 */
export function boxStyle(
  box: readonly [number, number, number, number],
  crop: Rect,
): { left: string; top: string; width: string; height: string } | null {
  if (crop.width <= 0 || crop.height <= 0) return null;
  const [x1, y1, x2, y2] = box;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  return {
    left: pct(x1, crop.width),
    top: pct(y1, crop.height),
    width: pct(x2 - x1, crop.width),
    height: pct(y2 - y1, crop.height),
  };
}
