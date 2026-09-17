/**
 * 「第一巡和牌」旗标的名字：荣和只有人和；自摸时庄家是天和、闲家是地和。
 * 不知道和牌者是不是庄（标注页不在房间里）时两个都写上。
 */
export function firstTakeLabel(tsumo: boolean, isDealer: boolean | null): string {
  if (!tsumo) return "人和";
  return isDealer === null ? "天和 / 地和" : isDealer ? "天和" : "地和";
}
