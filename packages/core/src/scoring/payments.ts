import type { RoomRules } from "../types/rules";
import { SEATS, nextSeat, type Seat } from "../types/tiles";
import { roundUpToHundred } from "./basePoints";

export interface WinPayment {
  /** 四家点数变动（含立直棒支出与和牌者的供托收入） */
  deltas: number[];
  /** 各支付者的实付（含本场），用于历史描述 */
  payers: { seat: Seat; amount: number; honba: number }[];
  /** 本场棒总收入 */
  honbaIncome: number;
  /** 历史立直供托收入（场供） */
  kyotakuIncome: number;
  /** 本局立直供托收入 */
  riichiIncome: number;
}

function emptyDeltas(): number[] {
  return [0, 0, 0, 0];
}

function applyRiichi(deltas: number[], riichi: readonly Seat[]): number {
  for (const seat of riichi) deltas[seat]! -= 1000;
  return riichi.length * 1000;
}

function honbaPerPayer(rules: RoomRules, honba: number, payers: number): number {
  return Math.round((rules.scoring.honbaValue * honba) / payers);
}

export interface TsumoInput {
  winner: Seat;
  dealer: Seat;
  base: number;
  honba: number;
  kyotaku: number;
  riichi: readonly Seat[];
  pao?: Seat | undefined;
}

export function tsumoPayment(input: TsumoInput, rules: RoomRules): WinPayment {
  const { winner, dealer, base, honba, kyotaku, riichi } = input;
  const deltas = emptyDeltas();
  const riichiIncome = applyRiichi(deltas, riichi);
  const honbaEach = honbaPerPayer(rules, honba, 3);
  const payers: WinPayment["payers"] = [];
  let baseTotal = 0;
  let honbaTotal = 0;

  for (const seat of SEATS) {
    if (seat === winner) continue;
    const multiplier = winner === dealer || seat === dealer ? 2 : 1;
    const basePay = roundUpToHundred(base * multiplier);
    baseTotal += basePay;
    honbaTotal += honbaEach;
    payers.push({ seat, amount: basePay + honbaEach, honba: honbaEach });
  }

  const pao = rules.scoring.pao ? input.pao : undefined;
  if (pao !== undefined && pao !== winner) {
    // 包牌自摸：责任者一人支付全部
    const all = baseTotal + honbaTotal;
    deltas[pao]! -= all;
    payers.length = 0;
    payers.push({ seat: pao, amount: all, honba: honbaTotal });
  } else {
    for (const p of payers) deltas[p.seat]! -= p.amount;
  }

  const kyotakuIncome = kyotaku * 1000;
  deltas[winner]! += baseTotal + honbaTotal + kyotakuIncome + riichiIncome;
  return { deltas, payers, honbaIncome: honbaTotal, kyotakuIncome, riichiIncome };
}

export interface RonInput {
  winner: Seat;
  loser: Seat;
  dealer: Seat;
  base: number;
  honba: number;
  /** 该和牌者是否收取场供与本局立直棒（双响时只有离放铳者最近的一家收） */
  kyotaku: number;
  riichi: readonly Seat[];
  collectsSticks: boolean;
  pao?: Seat | undefined;
}

export function ronPayment(input: RonInput, rules: RoomRules): WinPayment {
  const { winner, loser, dealer, base, honba, kyotaku, riichi, collectsSticks } = input;
  const deltas = emptyDeltas();
  const riichiIncome = collectsSticks ? applyRiichi(deltas, riichi) : 0;
  const basePay = roundUpToHundred(base * (winner === dealer ? 6 : 4));
  const honbaTotal = honbaPerPayer(rules, honba, 1);
  const payers: WinPayment["payers"] = [];

  const pao = rules.scoring.pao ? input.pao : undefined;
  if (pao !== undefined && pao !== winner && pao !== loser) {
    // 包牌荣和：责任者与放铳者各付一半基本支付，本场由放铳者付
    const half = basePay / 2;
    payers.push({ seat: loser, amount: half + honbaTotal, honba: honbaTotal });
    payers.push({ seat: pao, amount: half, honba: 0 });
  } else {
    payers.push({ seat: loser, amount: basePay + honbaTotal, honba: honbaTotal });
  }
  for (const p of payers) deltas[p.seat]! -= p.amount;

  const kyotakuIncome = collectsSticks ? kyotaku * 1000 : 0;
  deltas[winner]! += basePay + honbaTotal + kyotakuIncome + riichiIncome;
  return { deltas, payers, honbaIncome: honbaTotal, kyotakuIncome, riichiIncome };
}

/** 双响/三响时收取供托的和牌者：从放铳者下家起按顺序第一个和牌者。 */
export function sticksCollector(winners: readonly Seat[], loser: Seat): Seat {
  let seat = loser;
  for (let i = 0; i < 4; i++) {
    seat = nextSeat(seat);
    if (winners.includes(seat)) return seat;
  }
  throw new Error("winners 为空");
}

export interface DrawPayment {
  deltas: number[];
  riichiIncome: number;
  tenpai: Seat[];
  noten: Seat[];
}

/** 荒牌流局：不听罚符 + 立直棒进场供。 */
export function drawPayment(
  tenpaiFlags: readonly boolean[],
  riichi: readonly Seat[],
  rules: RoomRules,
): DrawPayment {
  const deltas = emptyDeltas();
  const riichiIncome = applyRiichi(deltas, riichi);
  const tenpai = SEATS.filter((s) => tenpaiFlags[s]);
  const noten = SEATS.filter((s) => !tenpaiFlags[s]);
  const bappu = rules.scoring.notenBappu;
  if (bappu > 0 && tenpai.length > 0 && noten.length > 0) {
    const pay = Math.round(bappu / noten.length);
    const gain = Math.round(bappu / tenpai.length);
    for (const s of noten) deltas[s]! -= pay;
    for (const s of tenpai) deltas[s]! += gain;
  }
  return { deltas, riichiIncome, tenpai, noten };
}

/** 流局满贯：按满贯自摸支付（含本场），可多人同时成立。 */
export function nagashiPayment(
  seats: readonly Seat[],
  dealer: Seat,
  honba: number,
  rules: RoomRules,
): number[] {
  const deltas = emptyDeltas();
  for (const seat of seats) {
    const p = tsumoPayment(
      { winner: seat, dealer, base: 2000, honba, kyotaku: 0, riichi: [] },
      rules,
    );
    for (const s of SEATS) deltas[s]! += p.deltas[s]!;
  }
  return deltas;
}

/** 错和满贯罚符：庄家 4000 all，闲家 2000/4000。 */
export function chomboPayment(offender: Seat, dealer: Seat): number[] {
  const deltas = emptyDeltas();
  for (const seat of SEATS) {
    if (seat === offender) continue;
    const amount = offender === dealer || seat === dealer ? 4000 : 2000;
    deltas[seat]! += amount;
    deltas[offender]! -= amount;
  }
  return deltas;
}

export function applyDeltas(points: readonly number[], deltas: readonly number[]): number[] {
  return points.map((p, i) => p + (deltas[i] ?? 0));
}
