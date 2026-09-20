import { describeValue } from "../format/describe";
import { formatPoints } from "../format/round";
import type { TenDrawReason, TenEntry, TenGameState, TenSeat } from "./state";

export const TEN_DRAW_LABELS: Record<TenDrawReason, string> = {
  noDeclare: "无人宣言流局",
  guessed: "被猜中流局",
  exhausted: "王牌流局",
};

export function tenDeclareLabel(riichi: boolean): string {
  return riichi ? "立直" : "听牌宣言";
}

/** 「第 3 局 1 本场」；0 本场也写出来（与四人房的「东1局0本场」一致） */
export function tenRoundLabel(round: number, honba: number): string {
  return `第 ${round} 局 ${honba} 本场`;
}

function role(seat: TenSeat, dealer: TenSeat): string {
  return seat === dealer ? "庄家" : "闲家";
}

/** 历史条目的完整描述。 */
export function describeTenEntry(entry: TenEntry): string {
  const head = tenRoundLabel(entry.round, entry.honba);
  if (entry.kind === "tenTsumo") {
    const name = entry.names[entry.winner]!;
    const honba = entry.honba > 0 ? `（含 ${entry.honba} 本场）` : "";
    return `${head}：${role(entry.winner, entry.dealer)} ${name} ${tenDeclareLabel(entry.riichi)}后自摸 ${describeValue(entry.value, entry.tier)}，得 ${formatPoints(entry.gain)} 点${honba}。`;
  }
  if (entry.attacker === null) return `${head}：18 巡内无人宣言，流局。`;
  const name = entry.names[entry.attacker]!;
  const how = entry.reason === "guessed" ? "被猜中待牌" : "摸到王牌仍未和";
  return `${head}：${role(entry.attacker, entry.dealer)} ${name} ${tenDeclareLabel(entry.riichi)}，${how}，流局。`;
}

function shortEntry(entry: TenEntry): string {
  const head = tenRoundLabel(entry.round, entry.honba);
  return entry.kind === "tenTsumo"
    ? `${head} ${entry.names[entry.winner]}自摸和`
    : `${head} ${TEN_DRAW_LABELS[entry.reason]}`;
}

/**
 * 撤销/重做前后的局面差异 → 被撤掉（或重做回来）的是哪一步。
 * 二人房的宣言也是可撤销的步骤，所以除了历史条目还要看阶段。
 */
export function describeTenRevert(
  before: TenGameState,
  after: TenGameState,
  /** 当前的座位昵称（对局中可以改名，开局快照里的可能是旧名字） */
  names: readonly string[],
): string {
  const [longer, shorter] =
    before.history.length >= after.history.length ? [before, after] : [after, before];
  // 历史新条目在头部：多出来的那一条就是第 0 条
  const moved = longer.history.length > shorter.history.length ? longer.history[0] : undefined;
  if (moved) return shortEntry(moved);
  if (before.status !== after.status) return "终局";
  const [b, a] = [before.stage, after.stage];
  if (b.kind !== a.kind) {
    const declared = b.kind === "B" ? b : a.kind === "B" ? a : null;
    if (declared) {
      return `${names[declared.attacker]}的${tenDeclareLabel(declared.riichi)}`;
    }
  }
  return "上一步操作";
}
