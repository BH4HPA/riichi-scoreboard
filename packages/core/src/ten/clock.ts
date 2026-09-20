import { TEN_DURATION_MS } from "./state";

/**
 * 暗计时的提示档：0 未到 / 1 剩余不到 10 分钟 / 2 剩余不到 5 分钟 / 3 时间到。
 * 规则要求计时不公开，所以只下发档位、不下发剩余时间。
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
