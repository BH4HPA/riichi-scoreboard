import { standings } from "@riichi/core";

export interface MyDiff {
  seat: number;
  /** 我减对方：正 = 我领先 */
  diff: number;
}

/** 我与其余三家的点差，按对方名次排列。 */
export function myDiffs(points: readonly number[], mySeat: number): MyDiff[] {
  return standings([...points])
    .filter((s) => s !== mySeat)
    .map((seat) => ({ seat, diff: points[mySeat]! - points[seat]! }));
}
