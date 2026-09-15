/**
 * 牌编码与 riichi-rs 一致：
 * 万 1-9 → 1..9，筒 1-9 → 10..18，索 1-9 → 19..27，东南西北 → 28..31，白发中 → 32..34。
 * 本项目额外定义赤五：赤五万 35、赤五筒 36、赤五索 37（送引擎前用 baseTile 折回 5，并计入 aka_count）。
 */
export type Tile = number;

export const AKA = { M5: 35, P5: 36, S5: 37 } as const;
export const AKA_TILES: readonly Tile[] = [AKA.M5, AKA.P5, AKA.S5];
export const MAX_TILE = AKA.S5;

/** 赤五 → 对应的普通五；其余原样。 */
export function baseTile(tile: Tile): Tile {
  if (tile === AKA.M5) return 5;
  if (tile === AKA.P5) return 14;
  if (tile === AKA.S5) return 23;
  return tile;
}

export function isAka(tile: Tile): boolean {
  return tile >= AKA.M5;
}

/** 忽略赤标记后是否同一张牌。 */
export function sameTile(a: Tile, b: Tile): boolean {
  return baseTile(a) === baseTile(b);
}

/** 普通五 → 赤五（非五牌原样返回）。 */
export function akaOf(tile: Tile): Tile {
  const base = baseTile(tile);
  if (base === 5) return AKA.M5;
  if (base === 14) return AKA.P5;
  if (base === 23) return AKA.S5;
  return tile;
}

export const TILE = {
  M1: 1,
  M2: 2,
  M3: 3,
  M4: 4,
  M5: 5,
  M6: 6,
  M7: 7,
  M8: 8,
  M9: 9,
  P1: 10,
  P2: 11,
  P3: 12,
  P4: 13,
  P5: 14,
  P6: 15,
  P7: 16,
  P8: 17,
  P9: 18,
  S1: 19,
  S2: 20,
  S3: 21,
  S4: 22,
  S5: 23,
  S6: 24,
  S7: 25,
  S8: 26,
  S9: 27,
  East: 28,
  South: 29,
  West: 30,
  North: 31,
  Haku: 32,
  Hatsu: 33,
  Chun: 34,
} as const;

export const ALL_TILES: readonly Tile[] = Array.from({ length: 34 }, (_, i) => i + 1);

/** 副露：open=false 且 4 张为暗杠；open=true 且 4 张为明杠/加杠；3 张为吃/碰。 */
export interface Meld {
  open: boolean;
  tiles: Tile[];
}

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** 风：0 东 1 南 2 西 3 北 */
export type Wind = 0 | 1 | 2 | 3;
export const WIND_LABELS = ["东", "南", "西", "北"] as const;

export function nextSeat(seat: Seat, step = 1): Seat {
  return ((((seat + step) % 4) + 4) % 4) as Seat;
}

/** 座位相对庄家的自风：庄家为东。 */
export function seatWind(seat: Seat, dealer: Seat): Wind {
  return ((((seat - dealer) % 4) + 4) % 4) as Wind;
}

export function windTile(wind: Wind): Tile {
  return TILE.East + wind;
}

export function isHonor(tile: Tile): boolean {
  return tile >= TILE.East && tile <= TILE.Chun;
}

export function tileSuit(tile: Tile): "m" | "p" | "s" | "z" {
  const t = baseTile(tile);
  if (t <= 9) return "m";
  if (t <= 18) return "p";
  if (t <= 27) return "s";
  return "z";
}

export function tileNumber(tile: Tile): number {
  const t = baseTile(tile);
  return isHonor(t) ? t - TILE.East + 1 : ((t - 1) % 9) + 1;
}

/** 宝牌指示牌 → 宝牌（赤五指示牌与普通五等价） */
export function doraFromIndicator(indicator: Tile): Tile {
  const t = baseTile(indicator);
  if (t >= TILE.Haku) return t === TILE.Chun ? TILE.Haku : t + 1;
  if (t >= TILE.East) return t === TILE.North ? TILE.East : t + 1;
  return tileNumber(t) === 9 ? t - 8 : t + 1;
}

/** 牌序排序键：按基础牌，赤五排在同数普通牌之前。 */
export function tileOrder(tile: Tile): number {
  return baseTile(tile) * 2 + (isAka(tile) ? 0 : 1);
}
