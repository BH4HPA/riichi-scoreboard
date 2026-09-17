/** 比分栏、历史栏各自的最小可用宽度（px）：四张分数卡放得下六位点数与名次徽章，历史表放得下牌图 */
export const SCORE_MIN_PX = 720;
export const HISTORY_MIN_PX = 400;
export const DEFAULT_SPLIT = 0.6;
/** 中间拖动条的宽度：fr 分的是扣掉它之后的宽度 */
export const HANDLE_PX = 16;

/** 比分栏占两栏总宽（容器宽减去拖动条）的比例，按宽度换算出可拖范围；放不下两者时固定默认值。 */
export function clampSplit(ratio: number, width: number): number {
  const lo = SCORE_MIN_PX / width;
  const hi = 1 - HISTORY_MIN_PX / width;
  if (!(width > 0) || lo > hi) return DEFAULT_SPLIT;
  return Math.min(hi, Math.max(lo, ratio));
}
