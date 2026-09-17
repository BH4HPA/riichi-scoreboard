import type { WinPoints } from "@riichi/core";

/** 点数的两行文案：主行是「谁付多少」，副行是合计与本场。 */
export function pointsText(p: WinPoints): { main: string; detail: string } {
  const honba = p.honba > 0 ? `，含本场 ${p.honba}` : "";
  if (p.kind === "ron") return { main: `${p.total} 点`, detail: `放铳者支付${honba}` };
  const main =
    p.fromDealer === null ? `${p.fromNonDealer} 点 ALL` : `${p.fromNonDealer} / ${p.fromDealer} 点`;
  const payers = p.fromDealer === null ? "三家各付" : "闲家 / 庄家各付";
  return { main, detail: `${payers}，合计 ${p.total} 点${honba}` };
}
