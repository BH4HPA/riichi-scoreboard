import type { TenTimeMark } from "@riichi/core";

/** 暗计时只有档位：规则要求不公开剩余时间，所以文案不写分钟数的倒计时 */
export const TIME_MARK_TEXT: Record<Exclude<TenTimeMark, 0>, string> = {
  1: "剩余不到 10 分钟",
  2: "剩余不到 5 分钟",
  3: "时间到，打完这局请终局",
};
