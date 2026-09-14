/**
 * 牌编码与 riichi-rs 一致：
 * 万 1-9 → 1..9，筒 1-9 → 10..18，索 1-9 → 19..27，东南西北 → 28..31，白发中 → 32..34。
 */
export type Tile = number;

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
  return tile >= TILE.East;
}

export function tileSuit(tile: Tile): "m" | "p" | "s" | "z" {
  if (tile <= 9) return "m";
  if (tile <= 18) return "p";
  if (tile <= 27) return "s";
  return "z";
}

export function tileNumber(tile: Tile): number {
  return isHonor(tile) ? tile - TILE.East + 1 : ((tile - 1) % 9) + 1;
}

/** 宝牌指示牌 → 宝牌 */
export function doraFromIndicator(indicator: Tile): Tile {
  if (indicator >= TILE.Haku) return indicator === TILE.Chun ? TILE.Haku : indicator + 1;
  if (indicator >= TILE.East) return indicator === TILE.North ? TILE.East : indicator + 1;
  return tileNumber(indicator) === 9 ? indicator - 8 : indicator + 1;
}
