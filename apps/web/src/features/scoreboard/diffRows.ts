export interface MyDiff {
  seat: number;
  /** 我减对方：正 = 我领先 */
  diff: number;
}

/** 我与其余三家的点差：落后越多越靠前、领先越少越靠前（即按点差从小到大）；同分按座位。 */
export function myDiffs(points: readonly number[], mySeat: number): MyDiff[] {
  return [0, 1, 2, 3]
    .filter((s) => s !== mySeat)
    .map((seat) => ({ seat, diff: points[mySeat]! - points[seat]! }))
    .sort((a, b) => a.diff - b.diff || a.seat - b.seat);
}
