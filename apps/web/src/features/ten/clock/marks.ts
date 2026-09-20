import type { TenStage, TenTimeMark } from "@riichi/core";

/**
 * 暗计时的提示文案。规则要求不公开剩余时间，所以不写分钟数的倒计时。
 * 时间到时按阶段说话：Stage B 里这一局还在打，「打完这局」；回到 Stage A 时那一局已经记完，
 * 屏幕上的「这局」是新的一局——这时只说「请终局」，不再邀人往下打。
 */
export function timeMarkText(mark: Exclude<TenTimeMark, 0>, stage: TenStage["kind"]): string {
  if (mark === 1) return "剩余不到 10 分钟";
  if (mark === 2) return "剩余不到 5 分钟";
  return stage === "B" ? "时间到，打完这局请终局" : "时间到，请终局";
}
