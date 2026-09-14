import type { RoomRules } from "../types/rules";
import { SEATS, type Seat } from "../types/tiles";

/** 名次：1 为一位。tieRule=seat 时同点按座位先后区分；split 时同点同名次（1,2,2,4）。 */
export function computeRanks(
  points: readonly number[],
  tieRule: RoomRules["final"]["tieRule"],
): number[] {
  const order = [...SEATS].sort((a, b) => points[b]! - points[a]! || a - b);
  const ranks = [0, 0, 0, 0];
  order.forEach((seat, position) => {
    const prev = order[position - 1];
    if (tieRule === "split" && prev !== undefined && points[prev] === points[seat]) {
      ranks[seat] = ranks[prev]!;
    } else {
      ranks[seat] = position + 1;
    }
  });
  return ranks;
}

/** 按点数从高到低的座位顺序（同点座位靠前者优先）。 */
export function standings(points: readonly number[]): Seat[] {
  return [...SEATS].sort((a, b) => points[b]! - points[a]! || a - b);
}

export interface TobiRecord {
  /** 被击飞者 */
  seat: Seat;
  /** 击飞者（和牌者或听牌方；无法归因时为 null） */
  by: Seat | null;
}

export interface FinalResult {
  /** 分配残留场供后的点数 */
  points: number[];
  /** 残留场供的分配（点） */
  kyotakuDeltas: number[];
  ranks: number[];
  /** 顺位马 + oka（千点单位） */
  uma: number[];
  /** 最终得分（千点单位，含 uma/oka/击飞奖励） */
  scores: number[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function distributeLeftoverKyotaku(
  points: readonly number[],
  kyotaku: number,
  rules: RoomRules,
): number[] {
  const deltas = [0, 0, 0, 0];
  if (kyotaku === 0) return deltas;
  const total = kyotaku * 1000;
  switch (rules.final.leftoverKyotaku) {
    case "top":
      deltas[standings(points)[0]!] = total;
      break;
    case "split":
      for (const s of SEATS) deltas[s] = total / 4;
      break;
    case "void":
      break;
  }
  return deltas;
}

/** 终局结算：uma 不含 oka，oka=(返点-起始点)×4/1000 归一位；同点按分时按分 uma 与 oka。 */
export function settleFinal(
  rawPoints: readonly number[],
  kyotaku: number,
  rules: RoomRules,
  tobi: TobiRecord | null = null,
): FinalResult {
  const kyotakuDeltas = distributeLeftoverKyotaku(rawPoints, kyotaku, rules);
  const points = rawPoints.map((p, i) => p + kyotakuDeltas[i]!);
  const { startPoints, returnPoints, uma: umaTable, tieRule } = rules.final;
  const oka = ((returnPoints - startPoints) * 4) / 1000;
  const positionValue = umaTable.map((u, i) => u + (i === 0 ? oka : 0));

  const order = standings(points);
  const ranks = computeRanks(points, tieRule);
  const uma = [0, 0, 0, 0];

  let i = 0;
  while (i < order.length) {
    let j = i;
    if (tieRule === "split") {
      while (j + 1 < order.length && points[order[j + 1]!] === points[order[i]!]) j++;
    }
    const groupTotal = positionValue.slice(i, j + 1).reduce((a, b) => a + b, 0);
    const each = groupTotal / (j - i + 1);
    for (let k = i; k <= j; k++) uma[order[k]!] = each;
    i = j + 1;
  }

  const scores = SEATS.map((s) => round1((points[s]! - returnPoints) / 1000 + uma[s]!));
  if (tobi && tobi.by !== null && rules.progress.tobi.enabled && rules.progress.tobi.bonus > 0) {
    scores[tobi.by] = round1(scores[tobi.by]! + rules.progress.tobi.bonus);
    scores[tobi.seat] = round1(scores[tobi.seat]! - rules.progress.tobi.bonus);
  }
  return { points, kyotakuDeltas, ranks, uma: uma.map(round1), scores };
}
