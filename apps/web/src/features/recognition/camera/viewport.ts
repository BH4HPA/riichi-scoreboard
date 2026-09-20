import type { Box } from "@riichi/core";
import { sourceBox, type Rotation } from "./orientation/upright";

export interface Viewport {
  /** 视频原始像素（没转正的那一帧） */
  videoWidth: number;
  videoHeight: number;
  /** 取景区域在屏幕上的尺寸 */
  displayWidth: number;
  displayHeight: number;
}

/** 画面在取景区域里的实际摆放（像素）：铺满居中、裁掉多出来的边（object-cover） */
export function fitBox(view: Viewport): { scale: number; left: number; top: number } | null {
  const { videoWidth: vw, videoHeight: vh, displayWidth: dw, displayHeight: dh } = view;
  if (vw <= 0 || vh <= 0 || dw <= 0 || dh <= 0) return null;
  const scale = Math.max(dw / vw, dh / vh);
  return { scale, left: (dw - vw * scale) / 2, top: (dh - vh * scale) / 2 };
}

/**
 * 转正后整帧里的矩形 → 取景区域里的定位（px）：检测框、识别范围都靠它画回屏幕。
 * 屏幕上的画面没转（手机横持时屏幕本身已经横过来了），所以先按 rotation 换回原始帧再按 cover 摆放。
 * 被 cover 裁到屏幕外的部分照实给出负值 / 超界值，由容器的 overflow-hidden 裁掉。
 */
export function boxOnScreen(
  box: Box,
  rotation: Rotation,
  view: Viewport,
): { left: number; top: number; width: number; height: number } | null {
  const fit = fitBox(view);
  if (!fit) return null;
  const [x1, y1, x2, y2] = sourceBox(box, rotation, {
    width: view.videoWidth,
    height: view.videoHeight,
  });
  return {
    left: fit.left + x1 * fit.scale,
    top: fit.top + y1 * fit.scale,
    width: (x2 - x1) * fit.scale,
    height: (y2 - y1) * fit.scale,
  };
}

/** 相册静帧送识别前的长边上限：与实时取景请求的分辨率一致（useCameraStream 的 1920） */
export const STILL_MAX_EDGE = 1920;

/** 按长边等比缩小到不超过 max（不放大），取整且至少 1 像素 */
export function fitLongEdge(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
