import { TEN_DURATION_MS } from "./state";

/**
 * 暗计时的提示档：0 未到 / 1 剩余不到 10 分钟 / 2 剩余不到 5 分钟 / 3 时间到。
 * 规则要求计时不公开：界面不显示剩余时间，协议里也不放倒计时，只给档位。
 * （这只是不替人读秒——谁都可以自己看表，开局时刻也在对局状态里；「不公开」靠的是牌桌上的自觉。）
 */
export type TenTimeMark = 0 | 1 | 2 | 3;

/** 各档的触发时刻（距开局的毫秒数），下标 + 1 = 档位 */
const MARK_OFFSETS_MS = [
  TEN_DURATION_MS - 10 * 60_000,
  TEN_DURATION_MS - 5 * 60_000,
  TEN_DURATION_MS,
];

export function tenTimeMark(startedAt: number, now: number): TenTimeMark {
  const elapsed = now - startedAt;
  return MARK_OFFSETS_MS.filter((offset) => elapsed >= offset).length as TenTimeMark;
}

/** 下一档的触发时刻；三档都过了为 null。服务端据此排定时器，到点重新广播房间视图。 */
export function nextTenMarkAt(startedAt: number, now: number): number | null {
  const offset = MARK_OFFSETS_MS[tenTimeMark(startedAt, now)];
  return offset === undefined ? null : startedAt + offset;
}
