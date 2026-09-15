import { DomainError } from "../progress/advance";
import type { RoomRules } from "../types/rules";
import type { EvaluatedHand, HandInput } from "../types/state";
import {
  baseTile,
  doraFromIndicator,
  isAka,
  MAX_TILE,
  seatWind,
  tileSuit,
  windTile,
  type Seat,
  type Tile,
  type Wind,
} from "../types/tiles";

/** riichi-rs 役 id（与 riichi_rs.d.ts 的 Yaku 常量一致）。 */
export const YAKU_ID = {
  Kokushimusou13Sides: 0,
  Kokushimusou: 1,
  Chuurenpoto9Sides: 2,
  Chuurenpoto: 3,
  SuuankouTanki: 4,
  Suuankou: 5,
  Daisuushi: 6,
  Shosuushi: 7,
  Daisangen: 8,
  Tsuuiisou: 9,
  Ryuuiisou: 10,
  Chinroutou: 11,
  Suukantsu: 12,
  Tenhou: 13,
  Chihou: 14,
  Renhou: 15,
  Daisharin: 16,
  Chinitsu: 17,
  Honitsu: 18,
  Ryanpeikou: 19,
  Junchan: 20,
  Chanta: 21,
  Toitoi: 22,
  Honroutou: 23,
  Sankantsu: 24,
  Shosangen: 25,
  SanshokuDoukou: 26,
  Sanankou: 27,
  Chiitoitsu: 28,
  DaburuRiichi: 29,
  Ittsu: 30,
  Sanshoku: 31,
  Tanyao: 32,
  Pinfu: 33,
  Iipeikou: 34,
  Menzentsumo: 35,
  Riichi: 36,
  Ippatsu: 37,
  Rinshan: 38,
  Chankan: 39,
  Haitei: 40,
  Houtei: 41,
  RoundWindEast: 42,
  RoundWindSouth: 43,
  RoundWindWest: 44,
  RoundWindNorth: 45,
  OwnWindEast: 46,
  OwnWindSouth: 47,
  OwnWindWest: 48,
  OwnWindNorth: 49,
  Haku: 50,
  Hatsu: 51,
  Chun: 52,
  Dora: 53,
  Uradora: 54,
  Akadora: 55,
} as const;

export const YAKU_NAMES: Record<number, string> = {
  0: "国士无双十三面",
  1: "国士无双",
  2: "纯正九莲宝灯",
  3: "九莲宝灯",
  4: "四暗刻单骑",
  5: "四暗刻",
  6: "大四喜",
  7: "小四喜",
  8: "大三元",
  9: "字一色",
  10: "绿一色",
  11: "清老头",
  12: "四杠子",
  13: "天和",
  14: "地和",
  15: "人和",
  16: "大车轮",
  17: "清一色",
  18: "混一色",
  19: "两杯口",
  20: "纯全带幺九",
  21: "混全带幺九",
  22: "对对和",
  23: "混老头",
  24: "三杠子",
  25: "小三元",
  26: "三色同刻",
  27: "三暗刻",
  28: "七对子",
  29: "两立直",
  30: "一气通贯",
  31: "三色同顺",
  32: "断幺九",
  33: "平和",
  34: "一杯口",
  35: "门前清自摸和",
  36: "立直",
  37: "一发",
  38: "岭上开花",
  39: "抢杠",
  40: "海底捞月",
  41: "河底捞鱼",
  42: "场风 东",
  43: "场风 南",
  44: "场风 西",
  45: "场风 北",
  46: "自风 东",
  47: "自风 南",
  48: "自风 西",
  49: "自风 北",
  50: "役牌 白",
  51: "役牌 发",
  52: "役牌 中",
  53: "宝牌",
  54: "里宝牌",
  55: "赤宝牌",
};

/** 与 riichi-rs `RiichiInput` 同形，core 不依赖其类型定义。 */
export interface EngineInput {
  closed_part: Tile[];
  open_part: Array<[boolean, Tile[]]>;
  options: {
    dora: Tile[];
    aka_count: number;
    first_take: boolean;
    riichi: boolean;
    ippatsu: boolean;
    double_riichi: boolean;
    after_kan: boolean;
    tile_discarded_by_someone: Tile | -1;
    bakaze: Tile;
    jikaze: Tile;
    allow_aka: boolean;
    allow_kuitan: boolean;
    with_kiriage: boolean;
    disabled_yaku: number[];
    allow_double_yakuman: boolean;
    last_tile: boolean;
  };
  calc_hairi: false;
}

export interface EngineOutput {
  is_agari: boolean;
  yakuman: number;
  han: number;
  fu: number;
  yaku: Record<string, number>;
}

export interface HandContext {
  seat: Seat;
  dealer: Seat;
  /** 场风 */
  roundWind: Wind;
}

/** 副露占用的手牌张数：吃/碰/杠都折算 3 张（杠子第 4 张不计入 14 张）。 */
const MELD_TILE_COUNT = 3;

function isTile(t: unknown): t is Tile {
  return Number.isInteger(t) && (t as number) >= 1 && (t as number) <= MAX_TILE;
}

/** 手牌与副露中的全部牌（含赤标记）。 */
export function allHandTiles(hand: Pick<HandInput, "closed" | "melds">): Tile[] {
  return [...hand.closed, ...hand.melds.flatMap((m) => m.tiles)];
}

/** 赤五张数（引擎 aka_count）。 */
export function akaCount(hand: Pick<HandInput, "closed" | "melds">): number {
  return allHandTiles(hand).filter(isAka).length;
}

/**
 * 每花色允许的赤五张数：赤 3 每色一张；赤 4 时五筒两张（常见规则）。
 */
export function akaLimit(suit: "m" | "p" | "s", rulesAkaCount: number): number {
  if (rulesAkaCount === 0) return 0;
  return rulesAkaCount >= 4 && suit === "p" ? 2 : 1;
}

/** 校验牌面输入的结构与规则约束。 */
export function validateHandInput(hand: HandInput, rules: RoomRules): void {
  if (!hand.closed.every(isTile)) throw new DomainError("bad_tiles", "暗牌含非法牌");
  for (const m of hand.melds) {
    if (!m.tiles.every(isTile)) throw new DomainError("bad_tiles", "副露含非法牌");
    if (m.tiles.length !== 3 && m.tiles.length !== 4)
      throw new DomainError("bad_meld", "副露必须是 3 或 4 张");
    if (m.tiles.length === 3 && !m.open) throw new DomainError("bad_meld", "3 张的副露必须是明的");
  }
  const total = hand.closed.length + hand.melds.length * MELD_TILE_COUNT;
  if (total !== 14) throw new DomainError("bad_count", "暗牌与副露合计应为 14 张（含和张）");
  if (!isTile(hand.winTile) || !hand.closed.includes(hand.winTile)) {
    throw new DomainError("bad_win_tile", "和张必须包含在暗牌中");
  }
  const akaBySuit = { m: 0, p: 0, s: 0 };
  for (const t of allHandTiles(hand)) {
    if (isAka(t)) akaBySuit[tileSuit(t) as "m" | "p" | "s"] += 1;
  }
  const akaTotal = akaBySuit.m + akaBySuit.p + akaBySuit.s;
  if (akaTotal > rules.hand.akaCount) {
    throw new DomainError("bad_aka", `赤宝牌最多 ${rules.hand.akaCount} 张`);
  }
  for (const suit of ["m", "p", "s"] as const) {
    if (akaBySuit[suit] > akaLimit(suit, rules.hand.akaCount)) {
      throw new DomainError("bad_aka", "同一花色的赤五超过规则允许张数");
    }
  }
  const maxIndicators = rules.hand.kanDora ? 5 : 1;
  if (hand.doraIndicators.length > maxIndicators || !hand.doraIndicators.every(isTile)) {
    throw new DomainError("bad_dora", `宝牌指示牌最多 ${maxIndicators} 张`);
  }
  if (hand.uraIndicators.length > 0) {
    if (!rules.hand.uraDora) throw new DomainError("bad_ura", "当前规则无里宝");
    if (!hand.riichi && !hand.doubleRiichi) throw new DomainError("bad_ura", "未立直不能计里宝");
    if (
      hand.uraIndicators.length > hand.doraIndicators.length ||
      !hand.uraIndicators.every(isTile)
    ) {
      throw new DomainError("bad_ura", "里宝指示牌数量不能超过宝牌指示牌");
    }
  }
  if (hand.ippatsu && !rules.hand.ippatsu) throw new DomainError("bad_ippatsu", "当前规则无一发");
  if (hand.ippatsu && !hand.riichi && !hand.doubleRiichi)
    throw new DomainError("bad_ippatsu", "未立直不能一发");
  const tileCounts = new Map<Tile, number>();
  for (const t of allHandTiles(hand)) {
    const b = baseTile(t);
    tileCounts.set(b, (tileCounts.get(b) ?? 0) + 1);
  }
  for (const [t, n] of tileCounts)
    if (n > 4) throw new DomainError("bad_tiles", `牌 ${t} 超过 4 张`);
}

/** 牌面 + 规则 → 引擎输入（赤五折回普通五，张数计入 aka_count）。 */
export function toEngineInput(hand: HandInput, ctx: HandContext, rules: RoomRules): EngineInput {
  validateHandInput(hand, rules);
  const dora = hand.doraIndicators.map(doraFromIndicator);
  if (hand.riichi || hand.doubleRiichi) dora.push(...hand.uraIndicators.map(doraFromIndicator));

  // 引擎约定：自摸时 closed_part 含 14 张且自摸牌在最后；荣和时 closed_part 为 13 张，和张单独由 tile_discarded_by_someone 传入
  const closed = [...hand.closed];
  closed.splice(closed.lastIndexOf(hand.winTile), 1);
  if (hand.tsumo) closed.push(hand.winTile);

  const disabled: number[] = [];
  if (!rules.hand.ippatsu) disabled.push(YAKU_ID.Ippatsu);
  if (rules.hand.renhou === "none") disabled.push(YAKU_ID.Renhou);

  return {
    closed_part: closed.map(baseTile),
    open_part: hand.melds.map((m) => [m.open, m.tiles.map(baseTile)]),
    options: {
      dora,
      aka_count: akaCount(hand),
      first_take: hand.firstTake,
      riichi: hand.riichi || hand.doubleRiichi,
      ippatsu: hand.ippatsu,
      double_riichi: hand.doubleRiichi,
      after_kan: hand.afterKan,
      tile_discarded_by_someone: hand.tsumo ? -1 : baseTile(hand.winTile),
      bakaze: windTile(ctx.roundWind),
      jikaze: windTile(seatWind(ctx.seat, ctx.dealer)),
      allow_aka: rules.hand.akaCount > 0,
      allow_kuitan: rules.hand.kuitan,
      with_kiriage: rules.scoring.kiriageMangan,
      disabled_yaku: disabled,
      allow_double_yakuman: rules.scoring.doubleYakuman,
      last_tile: hand.lastTile,
    },
    calc_hairi: false,
  };
}

/** 引擎输出 → EvaluatedHand（役满倍数按规则裁定）。 */
export function fromEngineOutput(out: EngineOutput, rules: RoomRules): EvaluatedHand {
  const yakuman = out.yakuman > 0 ? (rules.scoring.yakumanStacking ? out.yakuman : 1) : 0;
  return {
    han: out.han,
    fu: out.fu,
    yakuman,
    yaku: { ...out.yaku },
    isAgari: out.is_agari,
    ...(out.is_agari ? {} : { reason: "notAgari" as const }),
  };
}

export function yakuName(id: number | string): string {
  return YAKU_NAMES[Number(id)] ?? `役 ${id}`;
}
