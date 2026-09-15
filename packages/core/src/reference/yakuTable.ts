import { example, type HandExample } from "./notation";

export type YakuTag = "closedOnly" | "openMinusOne" | "pao" | "ruleDependent";

export const YAKU_TAG_LABELS: Record<YakuTag, string> = {
  closedOnly: "门前清限定",
  openMinusOne: "副露减一番",
  pao: "有包牌",
  ruleDependent: "视房间规则",
};

/** 役种速查条目。id 与引擎役 id 一致；≥100 为速查表专用（如流局满贯）。 */
export interface YakuInfo {
  id: number;
  name: string;
  /** 门清番数（役满为 0） */
  closed: number;
  /** 副露番数；null = 门前清限定 */
  open: number | null;
  /** 役满倍数（0 表示非役满） */
  yakuman: number;
  description: string;
  example: HandExample | null;
  tags: YakuTag[];
  /** 番数文案覆盖（如「满贯」） */
  hanLabel?: string;
}

const y = (
  id: number,
  name: string,
  closed: number,
  open: number | null,
  description: string,
  ex: HandExample | null,
  tags: YakuTag[] = [],
): YakuInfo => ({
  id,
  name,
  closed,
  open,
  yakuman: 0,
  description,
  example: ex,
  tags: open === null && !tags.includes("closedOnly") ? ["closedOnly", ...tags] : tags,
});

const ym = (
  id: number,
  name: string,
  yakuman: number,
  description: string,
  ex: HandExample,
  tags: YakuTag[] = [],
  closedOnly = false,
): YakuInfo => ({
  id,
  name,
  closed: 0,
  open: closedOnly ? null : 0,
  yakuman,
  description,
  example: ex,
  tags: closedOnly ? ["closedOnly", ...tags] : tags,
});

export const YAKU_1HAN: YakuInfo[] = [
  y(
    36,
    "立直",
    1,
    null,
    "门前清状态听牌即可立直，立直状态下和牌",
    example("123m456p789s111z22z", { win: "2z" }),
  ),
  y(
    37,
    "一发",
    1,
    null,
    "立直后一巡内和牌，期间无人鸣牌",
    example("234m567p345s678m22z", { win: "8m" }),
  ),
  y(
    35,
    "门前清自摸和",
    1,
    null,
    "门前清状态下自摸和牌",
    example("111m234m789p234s33z", { win: "4s" }),
  ),
  y(
    33,
    "平和",
    1,
    null,
    "四组顺子 + 非役牌雀头 + 两面听",
    example("123m456m789p234s77p", { win: "4s" }),
  ),
  y(
    32,
    "断幺九",
    1,
    1,
    "手牌中不包含幺九牌（1、9 与字牌）；副露成立需开启食断",
    example("234m567m345p678s88p", { win: "8s" }),
    ["ruleDependent"],
  ),
  y(34, "一杯口", 1, null, "两组完全相同的顺子", example("223344m567p789s11p", { win: "4m" })),
  y(46, "自风", 1, 1, "自风牌的刻子或杠子", example("222z234m567p789s44m", { win: "4m" })),
  y(42, "场风", 1, 1, "场风牌的刻子或杠子", example("111z345m567p678s99p", { win: "9p" })),
  y(50, "役牌 白/发/中", 1, 1, "三元牌的刻子或杠子", example("777z234m456p789s22s", { win: "2s" })),
  y(
    38,
    "岭上开花",
    1,
    1,
    "杠后摸岭上牌自摸和牌",
    example("123m456p789s22z", { melds: [{ open: false, tiles: "7777p" }], win: "2z" }),
  ),
  y(39, "抢杠", 1, 1, "他家加杠时，以该牌荣和", example("234m567m345p678s11p", { win: "3p" })),
  y(
    40,
    "海底捞月",
    1,
    1,
    "以牌山最后一张牌自摸和牌",
    example("123m456p789s22m567s", { win: "7s" }),
  ),
  y(
    41,
    "河底捞鱼",
    1,
    1,
    "以本局最后一张打出的牌荣和",
    example("345m678p123s88s456p", { win: "6p" }),
  ),
];

export const YAKU_2HAN: YakuInfo[] = [
  y(
    29,
    "两立直",
    2,
    null,
    "第一巡（无人鸣牌）即宣告立直",
    example("123m456p789s111z22z", { win: "2z" }),
  ),
  y(
    28,
    "七对子",
    2,
    null,
    "七组不同的对子；固定 25 符",
    example("1133m5577p2299s66z", { win: "6z" }),
  ),
  y(
    21,
    "混全带幺九",
    2,
    1,
    "每组面子与雀头都含幺九牌，且含字牌",
    example("123m789m123p789s11z", { win: "1z" }),
    ["openMinusOne"],
  ),
  y(
    30,
    "一气通贯",
    2,
    1,
    "同一花色 123、456、789 三组顺子",
    example("123456789m345p22s", { win: "9m" }),
    ["openMinusOne"],
  ),
  y(
    31,
    "三色同顺",
    2,
    1,
    "万、筒、索各一组数字相同的顺子",
    example("234m234p234s678m11z", { win: "4s" }),
    ["openMinusOne"],
  ),
  y(
    26,
    "三色同刻",
    2,
    2,
    "万、筒、索各一组数字相同的刻子",
    example("222m222p222s567m33z", { win: "2s" }),
  ),
  y(27, "三暗刻", 2, 2, "三组暗刻（含暗杠）", example("111m333p555s678m22z", { win: "8m" })),
  y(
    22,
    "对对和",
    2,
    2,
    "四组刻子或杠子 + 雀头",
    example("111m333p22z", {
      melds: [
        { open: true, tiles: "555s" },
        { open: true, tiles: "777m" },
      ],
      win: "2z",
    }),
  ),
  y(
    24,
    "三杠子",
    2,
    2,
    "三组杠子",
    example("234m22z", {
      melds: [
        { open: true, tiles: "1111p" },
        { open: true, tiles: "5555s" },
        { open: false, tiles: "7777m" },
      ],
      win: "2z",
    }),
  ),
  y(
    25,
    "小三元",
    2,
    2,
    "三元牌两组刻子 + 剩余一种作雀头",
    example("555z666z77z234m567p", { win: "7p" }),
  ),
  y(
    23,
    "混老头",
    2,
    2,
    "全部由幺九牌与字牌组成的刻子手",
    example("111m999p11z", {
      melds: [
        { open: true, tiles: "111s" },
        { open: true, tiles: "999s" },
      ],
      win: "1z",
    }),
  ),
];

export const YAKU_3HAN: YakuInfo[] = [
  y(18, "混一色", 3, 2, "一种数牌 + 字牌组成", example("123m555m789m111z22z", { win: "9m" }), [
    "openMinusOne",
  ]),
  y(
    20,
    "纯全带幺九",
    3,
    2,
    "每组面子与雀头都含 1 或 9，且不含字牌",
    example("123m789m123p789s99s", { win: "9s" }),
    ["openMinusOne"],
  ),
  y(19, "两杯口", 3, null, "两组一杯口", example("223344m667788p11z", { win: "1z" })),
];

export const YAKU_6HAN: YakuInfo[] = [
  y(17, "清一色", 6, 5, "全部由同一种数牌组成", example("111m234m567m789m99m", { win: "9m" }), [
    "openMinusOne",
  ]),
];

export const YAKU_MANGAN: YakuInfo[] = [
  {
    ...y(
      100,
      "流局满贯",
      5,
      5,
      "流局时舍牌全部为幺九牌与字牌，且未被他家鸣牌；按满贯自摸收取",
      null,
      ["ruleDependent"],
    ),
    hanLabel: "满贯",
  },
];

export const YAKU_YAKUMAN: YakuInfo[] = [
  ym(
    1,
    "国士无双",
    1,
    "十三种幺九牌各一张 + 其中任意一张作雀头",
    example("19m19p19s1234567z1m", { win: "1m" }),
    [],
    true,
  ),
  ym(
    5,
    "四暗刻",
    1,
    "四组暗刻（含暗杠）；双碰听荣和不成立",
    example("111m333p555s777m22z", { win: "2z" }),
    [],
    true,
  ),
  ym(8, "大三元", 1, "白、发、中三组刻子", example("555z666z777z123m22p", { win: "2p" }), ["pao"]),
  ym(
    7,
    "小四喜",
    1,
    "三种风牌刻子 + 剩余一种作雀头",
    example("111z222z333z44z234m", { win: "4m" }),
  ),
  ym(9, "字一色", 1, "全部由字牌组成", example("111z222z555z66z777z", { win: "7z" })),
  ym(
    10,
    "绿一色",
    1,
    "全部由 2、3、4、6、8 索与发组成",
    example("222s333s444s666s66z", { win: "6z" }),
  ),
  ym(
    11,
    "清老头",
    1,
    "全部由 1、9 数牌组成的刻子手",
    example("111m999m111p999s99p", { win: "9p" }),
  ),
  ym(
    12,
    "四杠子",
    1,
    "四组杠子",
    example("22z", {
      melds: [
        { open: true, tiles: "1111m" },
        { open: false, tiles: "5555p" },
        { open: true, tiles: "9999s" },
        { open: false, tiles: "7777z" },
      ],
      win: "2z",
    }),
    ["pao"],
  ),
  ym(
    3,
    "九莲宝灯",
    1,
    "同一花色 1112345678999 + 任意一张",
    example("11123456789995m", { win: "5m" }),
    [],
    true,
  ),
  ym(13, "天和", 1, "庄家配牌即和牌", example("123m456p789s111z22z", { win: "2z" }), [], true),
  ym(
    14,
    "地和",
    1,
    "闲家第一巡自摸和牌（无人鸣牌）",
    example("234m567p678s222z33z", { win: "3z" }),
    [],
    true,
  ),
  ym(
    15,
    "人和",
    1,
    "闲家第一巡荣和（无人鸣牌）；是否成立及价值视房间规则",
    example("345m678p234s333z44z", { win: "4z" }),
    ["ruleDependent"],
    true,
  ),
];

export const YAKU_DOUBLE_YAKUMAN: YakuInfo[] = [
  ym(
    0,
    "国士无双十三面",
    2,
    "国士无双听十三面和牌",
    example("19m19p19s1234567z1z", { win: "1z" }),
    [],
    true,
  ),
  ym(
    4,
    "四暗刻单骑",
    2,
    "四暗刻以单骑听和牌",
    example("111m333p555s777m22z", { win: "2z" }),
    [],
    true,
  ),
  ym(6, "大四喜", 2, "四种风牌四组刻子", example("111z222z333z444z55m", { win: "5m" }), ["pao"]),
  ym(
    2,
    "纯正九莲宝灯",
    2,
    "九莲宝灯听九面和牌",
    example("11122345678999m", { win: "2m" }),
    [],
    true,
  ),
];

export const YAKU_DORA: YakuInfo[] = [
  y(
    53,
    "宝牌",
    1,
    1,
    "宝牌指示牌的下一张为宝牌，每张 +1 番；不能单独作役",
    example("234m567p345s678s11z", { win: "1z", dora: "3m" }),
  ),
  y(
    54,
    "里宝牌",
    1,
    null,
    "立直和牌后翻开宝牌指示牌下方的里宝指示牌，每张 +1 番",
    example("234m567p345s678s11z", { win: "1z", dora: "3m", ura: "4p" }),
  ),
  y(
    55,
    "赤宝牌",
    1,
    1,
    "赤色的五（默认万筒索各一张），每张 +1 番",
    example("234m406p345s678s11z", { win: "1z" }),
    ["ruleDependent"],
  ),
];

export interface YakuPage {
  key: string;
  title: string;
  items: YakuInfo[];
}

export const YAKU_PAGES: YakuPage[] = [
  { key: "1", title: "一番", items: YAKU_1HAN },
  { key: "2", title: "二番", items: YAKU_2HAN },
  { key: "3", title: "三番", items: YAKU_3HAN },
  { key: "6", title: "六番", items: YAKU_6HAN },
  { key: "mangan", title: "满贯", items: YAKU_MANGAN },
  { key: "yakuman", title: "役满", items: YAKU_YAKUMAN },
  { key: "double", title: "双倍役满", items: YAKU_DOUBLE_YAKUMAN },
  { key: "dora", title: "宝牌", items: YAKU_DORA },
];

/** 番数文案：「2 番」「副露 1 番」「役满」「两倍役满」。 */
export function yakuHanText(info: YakuInfo): { main: string; sub: string | null } {
  if (info.hanLabel) return { main: info.hanLabel, sub: null };
  if (info.yakuman > 0)
    return { main: info.yakuman > 1 ? `${info.yakuman}倍役满` : "役满", sub: null };
  const main = `${info.closed} 番`;
  if (info.open === null || info.open === info.closed) return { main, sub: null };
  return { main, sub: `副露 ${info.open} 番` };
}
