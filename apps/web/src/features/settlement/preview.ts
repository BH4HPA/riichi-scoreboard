import {
  calcBasePoints,
  dealerOf,
  describeValue,
  drawDeltas,
  ronPayment,
  scoreTier,
  sticksCollector,
  tsumoPayment,
  type DrawResult,
  type GameState,
  type HandValue,
  type RoomRules,
  type Seat,
  type WinPayment,
} from "@riichi/core";

export interface WinPreview {
  payment: WinPayment;
  valueText: string;
  /** 不含本场/供托的基础得分 */
  baseIncome: number;
}

function baseIncome(payment: WinPayment, winner: Seat, riichi: Seat[], collects: boolean): number {
  return (
    payment.deltas[winner]! -
    payment.honbaIncome -
    payment.kyotakuIncome -
    payment.riichiIncome +
    (collects && riichi.includes(winner) ? 1000 : 0)
  );
}

export function previewTsumo(
  game: GameState,
  rules: RoomRules,
  winner: Seat,
  value: HandValue,
  riichi: Seat[],
  pao: Seat | null,
): WinPreview {
  const base = calcBasePoints(value, rules);
  const payment = tsumoPayment(
    {
      winner,
      dealer: dealerOf(game.kyoku),
      base,
      honba: game.honba,
      kyotaku: game.kyotaku,
      riichi,
      pao: pao ?? undefined,
    },
    rules,
  );
  return {
    payment,
    valueText: describeValue(value, scoreTier(value, rules)),
    baseIncome: baseIncome(payment, winner, riichi, true),
  };
}

export interface RonWinDraft {
  winner: Seat;
  value: HandValue;
  pao: Seat | null;
}

export function previewRon(
  game: GameState,
  rules: RoomRules,
  loser: Seat,
  wins: RonWinDraft[],
  riichi: Seat[],
): { deltas: number[]; wins: WinPreview[] } {
  const collector = sticksCollector(
    wins.map((w) => w.winner),
    loser,
  );
  const deltas = [0, 0, 0, 0];
  const previews = wins.map((w) => {
    const payment = ronPayment(
      {
        winner: w.winner,
        loser,
        dealer: dealerOf(game.kyoku),
        base: calcBasePoints(w.value, rules),
        honba: game.honba,
        kyotaku: game.kyotaku,
        riichi,
        collectsSticks: w.winner === collector,
        pao: w.pao ?? undefined,
      },
      rules,
    );
    payment.deltas.forEach((d, i) => (deltas[i]! += d));
    return {
      payment,
      valueText: describeValue(w.value, scoreTier(w.value, rules)),
      baseIncome: baseIncome(payment, w.winner, riichi, w.winner === collector),
    };
  });
  return { deltas, wins: previews };
}

export function previewDraw(
  game: GameState,
  rules: RoomRules,
  tenpai: boolean[],
  riichi: Seat[],
  nagashi: Seat[],
): DrawResult {
  return drawDeltas(tenpai, riichi, nagashi, dealerOf(game.kyoku), game.honba, rules);
}
