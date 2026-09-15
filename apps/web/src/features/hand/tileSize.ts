export type TileSize = "xs" | "sm" | "md" | "lg";

/** 牌面尺寸（宽 × 高，像素，比例与 SVG viewBox 19:26 一致）。 */
export const TILE_PX: Record<TileSize, { w: number; h: number }> = {
  xs: { w: 20, h: 27 },
  sm: { w: 26, h: 36 },
  md: { w: 34, h: 47 },
  lg: { w: 44, h: 60 },
};
