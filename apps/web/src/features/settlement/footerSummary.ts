import { formatDiff, type Seat } from "@riichi/core";

/*
 * 结算底栏的一行摘要：和牌者净收入口径，与下方预览的「最终收入」一致
 * （放铳者的变动可能含他自己的立直棒，不能拿来当「付了多少」）。
 */

function paoText(names: readonly string[], paos: readonly (Seat | null)[]): string {
  const seats = [...new Set(paos.filter((p): p is Seat => p !== null))];
  return seats.length ? `（${seats.map((s) => names[s]).join("、")}包牌）` : "";
}

export function tsumoSummary(
  names: readonly string[],
  winner: Seat,
  deltas: readonly number[],
  pao: Seat | null,
): string {
  return `${names[winner]} 自摸 · 收入 ${formatDiff(deltas[winner]!)}${paoText(names, [pao])}`;
}

export function ronSummary(
  names: readonly string[],
  loser: Seat,
  wins: readonly { winner: Seat; pao: Seat | null }[],
  deltas: readonly number[],
): string {
  const pao = paoText(
    names,
    wins.map((w) => w.pao),
  );
  if (wins.length === 1) {
    const w = wins[0]!.winner;
    return `${names[w]} 荣和 ${names[loser]} · 收入 ${formatDiff(deltas[w]!)}${pao}`;
  }
  const each = wins.map((w) => `${names[w.winner]} ${formatDiff(deltas[w.winner]!)}`).join("、");
  return `${each} 荣和 ${names[loser]}${pao}`;
}

export function missingText(items: readonly string[]): string {
  return `还需选择：${[...new Set(items)].join("、")}`;
}
