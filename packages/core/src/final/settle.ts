import type { RoomRules } from "../types/rules";
import { SEATS, type Seat } from "../types/tiles";

/** 名次：1 为一位。tieRule=seat 时同点按座位先后区分；split 时同点同名次（1,2,2,4）。 */
export function computeRanks(
  points: readonly number[],
  tieRule: RoomRules["final"]["tieRule"],
): number[] {
  const order = standings(points);
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

/** 按点数从高到低的座位顺序（同点座位靠前者优先，即离起家近者优先）。 */
export function standings(points: readonly number[]): Seat[] {
  return [...SEATS].sort((a, b) => points[b]! - points[a]! || a - b);
}

export interface TobiRecord {
  /** 被击飞者（一次结算可能同时飞两家） */
  seats: Seat[];
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

/** 同点者一组：按分时整组并列，否则每人一组。 */
function tieGroups(order: readonly Seat[], points: readonly number[], split: boolean): Seat[][] {
  const groups: Seat[][] = [];
  for (const seat of order) {
    const last = groups[groups.length - 1];
    if (split && last && points[last[0]!] === points[seat]) last.push(seat);
    else groups.push([seat]);
  }
  return groups;
}

/**
 * 把 total 按 unit 的整数倍尽量平均分给 seats：除不尽的余量按座位顺序（离起家近者先）各多得一份。
 * 点数（百位）与得分（十分之一千点）都用它，保证总和不变。
 */
function shareEvenly(seats: readonly Seat[], total: number, unit: number): Map<Seat, number> {
  const units = Math.round(total / unit);
  const base = Math.floor(units / seats.length);
  const extra = units - base * seats.length;
  return new Map(seats.map((s, i) => [s, (base + (i < extra ? 1 : 0)) * unit]));
}

/**
 * 残留场供：归一位时，按分规则下并列一位者平分（凑不齐百位的余数给离起家近者），并列名次不因此拆开。
 */
export function distributeLeftoverKyotaku(
  points: readonly number[],
  kyotaku: number,
  rules: RoomRules,
): number[] {
  const deltas = [0, 0, 0, 0];
  if (kyotaku === 0) return deltas;
  const total = kyotaku * 1000;
  switch (rules.final.leftoverKyotaku) {
    case "top": {
      const top = tieGroups(standings(points), points, rules.final.tieRule === "split")[0]!;
      for (const [seat, amount] of shareEvenly(top, total, 100)) deltas[seat] = amount;
      break;
    }
    case "split":
      for (const s of SEATS) deltas[s] = total / 4;
      break;
    case "void":
      break;
  }
  return deltas;
}

/**
 * 终局结算：名次与顺位点按分配残留场供之前的点数定（场供只是一位的奖金，不拆并列）；
 * uma 不含 oka，oka=(返点-起始点)×4/1000 归一位；同点按分时整组顺位点均分，余下的十分位给离起家近者。
 */
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

  const order = standings(rawPoints);
  const ranks = computeRanks(rawPoints, tieRule);
  const uma = [0, 0, 0, 0];
  let position = 0;
  for (const group of tieGroups(order, rawPoints, tieRule === "split")) {
    const groupTotal = positionValue
      .slice(position, position + group.length)
      .reduce((a, b) => a + b, 0);
    for (const [seat, share] of shareEvenly(group, groupTotal, 0.1)) uma[seat] = share;
    position += group.length;
  }

  const scores = SEATS.map((s) => round1((points[s]! - returnPoints) / 1000 + uma[s]!));
  if (tobi && tobi.by !== null && rules.progress.tobi.enabled && rules.progress.tobi.bonus > 0) {
    for (const seat of tobi.seats) {
      scores[tobi.by] = round1(scores[tobi.by]! + rules.progress.tobi.bonus);
      scores[seat] = round1(scores[seat]! - rules.progress.tobi.bonus);
    }
  }
  return { points, kyotakuDeltas, ranks, uma: uma.map(round1), scores };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
