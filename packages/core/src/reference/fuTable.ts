/** 符数计算表（速查展示用）。 */
export interface FuRule {
  item: string;
  fu: string;
  note?: string;
}

export const FU_BASE: FuRule[] = [
  { item: "副底", fu: "20" },
  { item: "门清荣和", fu: "+10" },
  { item: "自摸", fu: "+2", note: "平和自摸不加符" },
  { item: "七对子", fu: "25 固定", note: "不再加符" },
  { item: "平和自摸", fu: "20 固定" },
  { item: "副露平和形荣和", fu: "30 固定", note: "副露无役牌顺子手荣和按 30 符" },
];

export const FU_MELDS: Array<{
  item: string;
  closedSimple: number;
  openSimple: number;
  closedTerminal: number;
  openTerminal: number;
}> = [
  { item: "刻子", closedSimple: 4, openSimple: 2, closedTerminal: 8, openTerminal: 4 },
  { item: "杠子", closedSimple: 16, openSimple: 8, closedTerminal: 32, openTerminal: 16 },
];

export const FU_PAIR: FuRule[] = [
  { item: "役牌雀头", fu: "+2", note: "自风/场风/三元牌" },
  { item: "连风雀头", fu: "+2 或 +4", note: "M-League 按 +4" },
  { item: "非役牌雀头", fu: "0" },
];

export const FU_WAIT: FuRule[] = [
  { item: "两面听", fu: "0" },
  { item: "双碰听", fu: "0" },
  { item: "边张听", fu: "+2" },
  { item: "嵌张听", fu: "+2" },
  { item: "单骑听", fu: "+2" },
];

export const FU_NOTES = [
  "合计后向上取整到 10 符（25 符例外）。",
  "基本点 = 符 × 2^(番+2)，满贯以上按固定基本点。",
  "闲家荣和 = 基本点 × 4，庄家荣和 = 基本点 × 6，均向上取整到百；自摸时庄家付 2 倍、闲家付 1 倍基本点。",
];

/** 点数速查表的行：番 × 符 → 闲家荣和 / 庄家荣和 / 闲家自摸 / 庄家自摸 */
export const POINT_TABLE_FU = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110] as const;
export const POINT_TABLE_HAN = [1, 2, 3, 4] as const;
