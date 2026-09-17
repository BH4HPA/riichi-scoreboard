/**
 * 「第一巡和牌」旗标的名字：荣和只有人和；自摸时庄家是天和、闲家是地和。
 */
export function firstTakeLabel(tsumo: boolean, isDealer: boolean): string {
  if (!tsumo) return "人和";
  return isDealer ? "天和" : "地和";
}
