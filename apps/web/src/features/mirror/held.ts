/** 手机改牌后引擎重算约 300 ms；留足余量，超过仍为空才算真的清掉 */
export const MIRROR_HOLD_MS = 1000;
/** 按住的旧值：调暗加轻微高斯模糊，一眼看出是「上一份、正在重算」 */
export const MIRROR_STALE = "opacity-50 blur-[2px]";
export const MIRROR_STALE_TRANSITION = "transition-[opacity,filter] duration-200";
