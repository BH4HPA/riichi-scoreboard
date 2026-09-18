import { calcBasePoints, roundUpToHundred, scoreTier, TIER_LABELS } from "../scoring/basePoints";
import type { RoomRules } from "../types/rules";

export const POINT_TABLE_FU = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110] as const;
export const POINT_TABLE_HAN = [1, 2, 3, 4] as const;

export type PointRole = "ko" | "oya";

/** 一格：荣和点数 + 自摸支付（闲家：闲付/庄付；庄家：每家）。null 表示该组合不存在。 */
export interface PointCell {
  ron: number | null;
  tsumo: { ko: number; oya: number } | null;
}

export function pointsFromBase(base: number, role: PointRole): PointCell {
  if (role === "oya") {
    return {
      ron: roundUpToHundred(base * 6),
      tsumo: { ko: roundUpToHundred(base * 2), oya: roundUpToHundred(base * 2) },
    };
  }
  return {
    ron: roundUpToHundred(base * 4),
    tsumo: { ko: roundUpToHundred(base), oya: roundUpToHundred(base * 2) },
  };
}

/**
 * 番×符组合是否存在：
 * - 20 符只有平和自摸（≥2 番），无荣和；
 * - 25 符只有七对子（≥2 番），2 番时不可能自摸（门清自摸再加一番）。
 */
export function cellValidity(fu: number, han: number): { ron: boolean; tsumo: boolean } {
  if (fu === 20) return { ron: false, tsumo: han >= 2 };
  if (fu === 25) return { ron: han >= 2, tsumo: han >= 3 };
  return { ron: true, tsumo: true };
}

export interface LimitCard {
  hanText: string;
  label: string;
  cell: PointCell;
}

/** 右侧满贯以上卡片：满贯 / 跳满 / 倍满 / 三倍满 / 役满（或按规则 13 番仍为三倍满）。 */
export function limitCards(rules: RoomRules, role: PointRole): LimitCard[] {
  const cards: Array<[string, number]> = [
    ["5 番", 5],
    ["6～7 番", 6],
    ["8～10 番", 8],
    ["11～12 番", 11],
    ["13 番以上", 13],
  ];
  return cards.map(([hanText, han]) => {
    const value = { han, fu: 30, yakuman: 0 };
    return {
      hanText,
      label: TIER_LABELS[scoreTier(value, rules)],
      cell: pointsFromBase(calcBasePoints(value, rules), role),
    };
  });
}

export interface PointRow {
  fu: number;
  /** 1..4 番的普通格；到达满贯的列不在此列表里 */
  cells: Array<{ han: number; cell: PointCell }>;
  /** 本行从第几番起为满贯（1..4），null 表示本行没有满贯格 */
  manganFrom: number | null;
  /** 本行是否为一个合并块的首行；rowSpan = 块内行数 */
  manganBlock: { rowSpan: number } | null;
}

/**
 * 点数表布局：逐行给出普通格，并把「满贯及以上」的格子按起始列相同的连续行合并成块。
 * 起始列随符数增大单调不增，因此块总是矩形。
 */
export function buildPointsTable(rules: RoomRules, role: PointRole): PointRow[] {
  const rows: PointRow[] = POINT_TABLE_FU.map((fu) => {
    let manganFrom: number | null = null;
    const cells: PointRow["cells"] = [];
    for (const han of POINT_TABLE_HAN) {
      const value = { han, fu, yakuman: 0 };
      if (scoreTier(value, rules) !== "normal") {
        manganFrom = han;
        break;
      }
      const validity = cellValidity(fu, han);
      const raw = pointsFromBase(calcBasePoints(value, rules), role);
      cells.push({
        han,
        cell: { ron: validity.ron ? raw.ron : null, tsumo: validity.tsumo ? raw.tsumo : null },
      });
    }
    return { fu, cells, manganFrom, manganBlock: null };
  });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.manganFrom === null) continue;
    const prev = rows[i - 1];
    if (prev && prev.manganFrom === row.manganFrom) continue;
    let span = 1;
    while (rows[i + span] && rows[i + span]!.manganFrom === row.manganFrom) span += 1;
    row.manganBlock = { rowSpan: span };
  }
  return rows;
}

export const MANGAN_CELL = (rules: RoomRules, role: PointRole): PointCell =>
  pointsFromBase(calcBasePoints({ han: 5, fu: 30, yakuman: 0 }, rules), role);
