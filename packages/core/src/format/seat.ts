import type { Seat } from "../types/tiles";

/** 座位固定东南西北逆时针坐，出牌顺序 +1 即下家。 */
const RELATIVE_LABELS = ["自己", "下家", "对家", "上家"] as const;

/** 以操作者座位为视角的相对方位；不在座（主控台、未入座的手机）时为 null。 */
export function relativeSeatLabel(me: Seat | null, seat: Seat): string | null {
  return me === null ? null : RELATIVE_LABELS[(seat - me + 4) % 4]!;
}
