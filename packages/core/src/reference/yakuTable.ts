/** 番符表：役种一览（用于速查展示）。han.open 为 null 表示门清限定。 */
export interface YakuInfo {
  id: number;
  name: string;
  closed: number;
  /** 副露后的番数；null = 门清限定 */
  open: number | null;
  /** 役满倍数（0 表示非役满） */
  yakuman: number;
  note?: string;
}

export const YAKU_TABLE_1HAN: YakuInfo[] = [
  { id: 36, name: "立直", closed: 1, open: null, yakuman: 0 },
  { id: 37, name: "一发", closed: 1, open: null, yakuman: 0, note: "立直后一巡内和牌，中途无鸣牌" },
  { id: 35, name: "门前清自摸和", closed: 1, open: null, yakuman: 0 },
  { id: 33, name: "平和", closed: 1, open: null, yakuman: 0, note: "四顺子 + 非役牌雀头 + 两面听" },
  { id: 32, name: "断幺九", closed: 1, open: 1, yakuman: 0, note: "副露成立需开启食断" },
  { id: 34, name: "一杯口", closed: 1, open: null, yakuman: 0 },
  { id: 46, name: "自风", closed: 1, open: 1, yakuman: 0 },
  { id: 42, name: "场风", closed: 1, open: 1, yakuman: 0 },
  { id: 50, name: "役牌 白/发/中", closed: 1, open: 1, yakuman: 0 },
  { id: 38, name: "岭上开花", closed: 1, open: 1, yakuman: 0 },
  { id: 39, name: "抢杠", closed: 1, open: 1, yakuman: 0 },
  { id: 40, name: "海底捞月", closed: 1, open: 1, yakuman: 0 },
  { id: 41, name: "河底捞鱼", closed: 1, open: 1, yakuman: 0 },
];

export const YAKU_TABLE_2HAN: YakuInfo[] = [
  { id: 29, name: "两立直", closed: 2, open: null, yakuman: 0 },
  { id: 28, name: "七对子", closed: 2, open: null, yakuman: 0, note: "固定 25 符" },
  { id: 21, name: "混全带幺九", closed: 2, open: 1, yakuman: 0 },
  { id: 30, name: "一气通贯", closed: 2, open: 1, yakuman: 0 },
  { id: 31, name: "三色同顺", closed: 2, open: 1, yakuman: 0 },
  { id: 26, name: "三色同刻", closed: 2, open: 2, yakuman: 0 },
  { id: 27, name: "三暗刻", closed: 2, open: 2, yakuman: 0 },
  { id: 22, name: "对对和", closed: 2, open: 2, yakuman: 0 },
  { id: 24, name: "三杠子", closed: 2, open: 2, yakuman: 0 },
  { id: 25, name: "小三元", closed: 2, open: 2, yakuman: 0 },
  { id: 23, name: "混老头", closed: 2, open: 2, yakuman: 0 },
];

export const YAKU_TABLE_3HAN_PLUS: YakuInfo[] = [
  { id: 18, name: "混一色", closed: 3, open: 2, yakuman: 0 },
  { id: 20, name: "纯全带幺九", closed: 3, open: 2, yakuman: 0 },
  { id: 19, name: "两杯口", closed: 3, open: null, yakuman: 0 },
  { id: 17, name: "清一色", closed: 6, open: 5, yakuman: 0 },
];

export const YAKU_TABLE_YAKUMAN: YakuInfo[] = [
  { id: 1, name: "国士无双", closed: 0, open: null, yakuman: 1 },
  {
    id: 0,
    name: "国士无双十三面",
    closed: 0,
    open: null,
    yakuman: 2,
    note: "两倍役满需开启多倍役满",
  },
  { id: 5, name: "四暗刻", closed: 0, open: null, yakuman: 1 },
  { id: 4, name: "四暗刻单骑", closed: 0, open: null, yakuman: 2, note: "两倍役满需开启多倍役满" },
  { id: 8, name: "大三元", closed: 0, open: 0, yakuman: 1, note: "有包牌" },
  { id: 7, name: "小四喜", closed: 0, open: 0, yakuman: 1 },
  { id: 6, name: "大四喜", closed: 0, open: 0, yakuman: 2, note: "有包牌；两倍役满需开启多倍役满" },
  { id: 9, name: "字一色", closed: 0, open: 0, yakuman: 1 },
  { id: 10, name: "绿一色", closed: 0, open: 0, yakuman: 1 },
  { id: 11, name: "清老头", closed: 0, open: 0, yakuman: 1 },
  { id: 12, name: "四杠子", closed: 0, open: 0, yakuman: 1, note: "有包牌" },
  { id: 3, name: "九莲宝灯", closed: 0, open: null, yakuman: 1 },
  {
    id: 2,
    name: "纯正九莲宝灯",
    closed: 0,
    open: null,
    yakuman: 2,
    note: "两倍役满需开启多倍役满",
  },
  { id: 13, name: "天和", closed: 0, open: null, yakuman: 1 },
  { id: 14, name: "地和", closed: 0, open: null, yakuman: 1 },
  { id: 15, name: "人和", closed: 0, open: null, yakuman: 1, note: "按房间规则决定是否成立" },
];

export const YAKU_TABLE_DORA: YakuInfo[] = [
  { id: 53, name: "宝牌", closed: 1, open: 1, yakuman: 0, note: "每张 1 番，不能单独作役" },
  { id: 54, name: "里宝牌", closed: 1, open: null, yakuman: 0, note: "立直和牌后翻开" },
  { id: 55, name: "赤宝牌", closed: 1, open: 1, yakuman: 0 },
];

export const YAKU_TABLE_SECTIONS: Array<{ title: string; items: YakuInfo[] }> = [
  { title: "一番", items: YAKU_TABLE_1HAN },
  { title: "二番", items: YAKU_TABLE_2HAN },
  { title: "三番以上", items: YAKU_TABLE_3HAN_PLUS },
  { title: "役满", items: YAKU_TABLE_YAKUMAN },
  { title: "宝牌", items: YAKU_TABLE_DORA },
];
