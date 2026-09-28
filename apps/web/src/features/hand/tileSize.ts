export type TileSize = "xs" | "sm" | "md" | "lg";

/** 牌面尺寸（宽 × 高，按 16px 根字号设计的像素，比例与 SVG viewBox 19:26 一致）。 */
const TILE_PX: Record<TileSize, { w: number; h: number }> = {
  xs: { w: 20, h: 27 },
  sm: { w: 26, h: 36 },
  md: { w: 34, h: 47 },
  lg: { w: 44, h: 60 },
};

const rem = (px: number) => `${px / 16}rem`;

/**
 * 实际输出用 rem：主控台放大根字号时牌图跟着放大。
 * 各值都是 1/16 的整数倍，16px 根字号（手机）下与原来的像素逐点一致。
 */
export const TILE_SIZE: Record<TileSize, { w: string; h: string }> = {
  xs: { w: rem(TILE_PX.xs.w), h: rem(TILE_PX.xs.h) },
  sm: { w: rem(TILE_PX.sm.w), h: rem(TILE_PX.sm.h) },
  md: { w: rem(TILE_PX.md.w), h: rem(TILE_PX.md.h) },
  lg: { w: rem(TILE_PX.lg.w), h: rem(TILE_PX.lg.h) },
};
