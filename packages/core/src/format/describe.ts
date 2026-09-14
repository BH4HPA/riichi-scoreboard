import { TIER_LABELS, yakumanLabel, type HandValue, type ScoreTier } from "../scoring/basePoints";
import { dealerOf, type HistoryEntry, type WinRecord } from "../types/state";
import type { Seat } from "../types/tiles";
import { formatPoints, roundLabel } from "./round";

const ABORTIVE_LABELS = {
  kyuushu: "九种九牌",
  suufon: "四风连打",
  suucha: "四家立直",
  suukan: "四杠散了",
  sanchahou: "三家和了",
} as const;

export function describeValue(value: HandValue, tier: ScoreTier): string {
  if (value.yakuman > 0) return yakumanLabel(value.yakuman);
  const base = `${value.han} 番 ${value.fu} 符`;
  const label = TIER_LABELS[tier];
  return label ? `${base}（${label}）` : base;
}

function honbaClause(honba: number): string {
  return honba > 0 ? `（其中 ${formatPoints(honba)} 点为本场棒）` : "";
}

function stickClauses(win: WinRecord): string {
  const parts: string[] = [];
  if (win.payment.kyotakuIncome > 0)
    parts.push(`历史立直供托收入 ${formatPoints(win.payment.kyotakuIncome)} 点`);
  if (win.payment.riichiIncome > 0)
    parts.push(`本局立直供托收入 ${formatPoints(win.payment.riichiIncome)} 点`);
  return parts.length ? `，${parts.join("，")}` : "";
}

function role(seat: Seat, dealer: Seat): string {
  return seat === dealer ? "庄家" : "闲家";
}

function describeTsumo(entry: Extract<HistoryEntry, { kind: "tsumo" }>): string {
  const { win, names, dealer } = entry;
  const name = names[win.winner]!;
  const gain = formatPoints(entry.deltas[win.winner]!);
  const value = describeValue(win.value, win.tier);
  const pao =
    win.pao !== null && win.payment.payers.length === 1 && win.payment.payers[0]!.seat === win.pao;
  if (pao) {
    const p = win.payment.payers[0]!;
    return `${role(win.winner, dealer)} ${name} 自摸 ${value}，包牌者 ${names[p.seat]} 支付 ${formatPoints(p.amount)} 点${honbaClause(p.honba)}${stickClauses(win)}，共收入 ${gain} 点。`;
  }
  if (win.winner === dealer) {
    const p = win.payment.payers[0]!;
    return `庄家 ${name} 自摸 ${value}，闲家各支付 ${formatPoints(p.amount)} 点${honbaClause(p.honba)}${stickClauses(win)}，共收入 ${gain} 点。`;
  }
  const dealerPay = win.payment.payers.find((p) => p.seat === dealer)!;
  const otherPay = win.payment.payers.find((p) => p.seat !== dealer)!;
  return `闲家 ${name} 自摸 ${value}，庄家 ${names[dealer]} 支付 ${formatPoints(dealerPay.amount)} 点${honbaClause(dealerPay.honba)}，其余闲家支付 ${formatPoints(otherPay.amount)} 点${honbaClause(otherPay.honba)}${stickClauses(win)}，共收入 ${gain} 点。`;
}

function describeRon(entry: Extract<HistoryEntry, { kind: "ron" }>): string {
  const { names, dealer, loser } = entry;
  return entry.wins
    .map((win) => {
      const total = win.payment.payers.reduce((a, p) => a + p.amount, 0);
      const paoPayer = win.payment.payers.find((p) => p.seat !== loser);
      const paoClause = paoPayer
        ? `（包牌者 ${names[paoPayer.seat]} 分担 ${formatPoints(paoPayer.amount)} 点）`
        : "";
      return `${role(win.winner, dealer)} ${names[win.winner]} 荣和 ${names[loser]} ${describeValue(win.value, win.tier)}，共 ${formatPoints(total)} 点${honbaClause(win.payment.honbaIncome)}${paoClause}${stickClauses(win)}，共收入 ${formatPoints(entry.deltas[win.winner]!)} 点。`;
    })
    .join("");
}

function seatList(seats: readonly Seat[], names: readonly string[]): string {
  return seats.length ? seats.map((s) => names[s]).join("、") : "无";
}

export function describeEntry(entry: HistoryEntry): string {
  const { names } = entry;
  switch (entry.kind) {
    case "tsumo":
      return describeTsumo(entry);
    case "ron":
      return describeRon(entry);
    case "draw": {
      if (entry.nagashi.length > 0) {
        return `流局满贯：${seatList(entry.nagashi, names)} 按满贯自摸收取，本局立直供托计入场供 ${formatPoints(entry.riichiIncome)} 点。`;
      }
      return `流局，本局立直供托计入场供 ${formatPoints(entry.riichiIncome)} 点，听牌：${seatList(entry.tenpai, names)}，未听牌：${seatList(entry.noten, names)}。`;
    }
    case "abortive":
      return `途中流局（${ABORTIVE_LABELS[entry.reason]}），本场 +1，庄家连庄。`;
    case "chombo":
      return `${names[entry.offender]} 错和，满贯罚符。`;
    case "kyotaku":
      return entry.to === null
        ? `终局立直供托 ${formatPoints(entry.amount)} 点按规则处理。`
        : `一位 ${names[entry.to]} 终局立直供托分配：${names[entry.to]} 收入 ${formatPoints(entry.amount)} 点。`;
    case "adjust":
      return `调整场况：${roundLabel(entry.kyoku, entry.honba)} → ${roundLabel(entry.to.kyoku, entry.to.honba)}，庄家 ${names[dealerOf(entry.to.kyoku)]}。`;
  }
}

export const ENTRY_KIND_LABELS: Record<HistoryEntry["kind"], string> = {
  tsumo: "自摸",
  ron: "荣和",
  draw: "流局",
  abortive: "途中流局",
  chombo: "错和",
  kyotaku: "供托",
  adjust: "调整",
};
