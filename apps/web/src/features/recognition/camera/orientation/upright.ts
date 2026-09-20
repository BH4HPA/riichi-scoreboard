import type { Box, FrameSize } from "@riichi/core";

/**
 * 界面相对页面顺时针转了多少度，也就是手机被逆着转了多少：
 * 90 = 逆时针横持（机顶朝左），270 = 顺时针横持（机顶朝右），0 = 竖持（或页面已经自己跟着转了）。
 * 页面不转、手机转了的时候，相机给的帧是「躺着」的；送识别前要转正，画回屏幕时再转回去。
 */
export type Rotation = 0 | 90 | 270;

/** 转正以后的帧尺寸 */
export function uprightSize(source: FrameSize, rotation: Rotation): FrameSize {
  return rotation === 0 ? source : { width: source.height, height: source.width };
}

/** 正立帧里的矩形 → 它在原始帧里占的那一块（90° 的整数倍，仍是轴对齐矩形） */
export function sourceBox(box: Box, rotation: Rotation, source: FrameSize): Box {
  const [u1, v1, u2, v2] = box;
  // 90：正立帧 = 原始帧逆时针转 90°，(x, y) → (y, W − x)，反过来 x = W − v、y = u
  if (rotation === 90) return [source.width - v2, u1, source.width - v1, u2];
  // 270：正立帧 = 原始帧顺时针转 90°，(x, y) → (H − y, x)，反过来 x = v、y = H − u
  if (rotation === 270) return [v1, source.height - u2, v2, source.height - u1];
  return box;
}

/** 把原始帧画成正立的，画布要转的角度（弧度，顺时针为正） */
export function uprightAngle(rotation: Rotation): number {
  return rotation === 90 ? -Math.PI / 2 : rotation === 270 ? Math.PI / 2 : 0;
}
