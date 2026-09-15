import { TILE } from "../types/tiles";

/** 符数计算公式（按「底符 + 面子 + 雀头 + 听牌形 + 和牌状态」分段展示）。 */
export interface FuLine {
  item: string;
  fu: string;
  note?: string;
}

export const FU_BASE: FuLine = { item: "固定计算", fu: "+20" };

export interface FuMeldRow {
  item: string;
  /** 中张牌 */
  simple: number;
  /** 幺九牌（含字牌） */
  terminal: number;
}

export const FU_MELDS: FuMeldRow[] = [
  { item: "明刻", simple: 2, terminal: 4 },
  { item: "暗刻", simple: 4, terminal: 8 },
  { item: "明杠", simple: 8, terminal: 16 },
  { item: "暗杠", simple: 16, terminal: 32 },
];

/** 面子表头示例牌：中张 5 筒、幺九 1 万 */
export const FU_MELD_SAMPLES = { simple: TILE.P5, terminal: TILE.M1 } as const;

export const FU_PAIR: FuLine[] = [
  { item: "门风", fu: "+2" },
  { item: "场风", fu: "+2" },
  { item: "连风", fu: "+4", note: "本计分板引擎按 +4 计算" },
  { item: "三元牌", fu: "+2" },
];

export const FU_WAIT: FuLine[] = [
  { item: "单骑听牌", fu: "+2" },
  { item: "坎张听牌", fu: "+2" },
  { item: "边张听牌", fu: "+2" },
];

export const FU_STATE: FuLine[] = [
  { item: "自摸", fu: "+2", note: "无平和役种时" },
  { item: "荣和", fu: "+10", note: "门前状态时" },
];

export const FU_ROUNDING =
  "以上计算结果向上取整至 10 位进位，即为最终符数（如计算结果为 32，最终符数为 40 符）。";

export const FU_SPECIALS = [
  "平和役种 + 门前自摸和牌，最终结果固定为 20 符。",
  "七对子役种（无论荣和/自摸），最终结果固定为 25 符。",
  "副露和牌不足 30 符时，最终结果固定为 30 符。",
];
