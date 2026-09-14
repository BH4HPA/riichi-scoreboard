import { WIND_LABELS, type Wind } from "../types/tiles";

export function kyokuWind(kyoku: number): Wind {
  return (Math.floor(kyoku / 4) % 4) as Wind;
}

export function kyokuNumber(kyoku: number): number {
  return (kyoku % 4) + 1;
}

/** `东1局` */
export function kyokuLabel(kyoku: number): string {
  return `${WIND_LABELS[kyokuWind(kyoku)]}${kyokuNumber(kyoku)}局`;
}

/** `东1局0本场` */
export function roundLabel(kyoku: number, honba: number): string {
  return `${kyokuLabel(kyoku)}${honba}本场`;
}

export function formatPoints(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDiff(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "-"}${formatPoints(Math.abs(value))}`;
}

/** 千点单位的终局得分：+62.0 / -23.5 */
export function formatScore(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(1)}`;
}
