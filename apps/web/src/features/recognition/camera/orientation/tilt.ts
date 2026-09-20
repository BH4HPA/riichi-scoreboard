import type { Rotation } from "./upright";

/** 某个方向倾斜超过这个角度才算数：对着桌面拍时手机接近水平，一两度的不平很正常 */
export const TILT_DEGREES = 15;
/** 主方向的重力分量要比另一个方向大这么多倍：斜着拿（两个方向都倾斜）时不来回切 */
export const TILT_DOMINANCE = 1.5;

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * 由 `deviceorientation` 的 β / γ 判断手机怎么拿着；拿不准就保持 `prev`（水平、斜着、倒着都算拿不准）。
 *
 * 用 β / γ 还原重力在屏幕平面上的两个分量，而不是直接比角度：γ 接近 ±90° 时 β 会在 0 / 180 之间跳，
 * 但 cosβ·sinγ 是连续的。也不用 `devicemotion` 的重力——iOS 给的符号与规范相反。
 * x = 重力沿屏幕右方向的分量，y = 沿屏幕下方向的分量（竖着拿时 y ≈ 1）。
 *
 * `screenAngle` 是页面自己已经转过的角度（`screen.orientation.angle`）：系统旋转锁关着时页面会跟着转，
 * 相机帧也已经是正的，界面不用再转。
 */
export function rotationFromTilt(
  beta: number,
  gamma: number,
  screenAngle: number,
  prev: Rotation,
): Rotation {
  const x = Math.cos(rad(beta)) * Math.sin(rad(gamma));
  const y = Math.sin(rad(beta));
  const min = Math.sin(rad(TILT_DEGREES));
  let device: number;
  if (Math.abs(x) > min && Math.abs(x) > TILT_DOMINANCE * Math.abs(y)) device = x < 0 ? 90 : 270;
  else if (y > min && y > TILT_DOMINANCE * Math.abs(x)) device = 0;
  else return prev;
  const relative = (((device - screenAngle) % 360) + 360) % 360;
  // 相对页面倒过来（180）：没有对应的界面方向，当作拿不准
  return relative === 0 || relative === 90 || relative === 270 ? relative : prev;
}
