import type { RoomRules } from "../types/rules";
import type { GameState } from "../types/state";
import { nextSeat } from "../types/tiles";
import { standings } from "../final/settle";

export type Outcome =
  | { kind: "win"; dealerWon: boolean }
  | { kind: "draw"; dealerTenpai: boolean }
  | { kind: "abortive" }
  | { kind: "chombo" };

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** 规定局数的最后一局索引（东风战 3，半庄 7）。 */
export function lastKyoku(rules: RoomRules): number {
  return rules.progress.length === "east" ? 3 : 7;
}

/** 延长战允许的最后一局索引。 */
export function maxKyoku(rules: RoomRules): number {
  return lastKyoku(rules) + (rules.progress.enchousen.enabled ? 4 : 0);
}

export function isFinalKyoku(kyoku: number, rules: RoomRules): boolean {
  return kyoku >= lastKyoku(rules);
}

function anyTobi(points: readonly number[], rules: RoomRules): boolean {
  if (!rules.progress.tobi.enabled) return false;
  const limit = rules.progress.tobi.threshold === "at0" ? 0 : -1;
  return points.some((p) => p <= limit);
}

function reachedEnchousenTarget(points: readonly number[], rules: RoomRules): boolean {
  return Math.max(...points) >= rules.progress.enchousen.threshold;
}

/** 庄家是否为唯一一位（和了止/听牌止条件） */
function dealerIsSoleTop(game: GameState): boolean {
  const [top, second] = standings(game.points);
  return top === game.dealer && game.points[top!]! > game.points[second!]!;
}

/**
 * 局结束后的场况推进与终局判定。输入的 game 已应用本局点数变动。
 * endGame=true 表示操作者选择和了止/听牌止；仅在规则允许且条件成立时生效，否则报错。
 */
export function advance(
  game: GameState,
  outcome: Outcome,
  rules: RoomRules,
  endGame = false,
): GameState {
  let { kyoku, honba, dealer } = game;
  let dealerStays: boolean;

  switch (outcome.kind) {
    case "win":
      dealerStays = outcome.dealerWon;
      honba = dealerStays ? honba + 1 : 0;
      break;
    case "draw":
      dealerStays = outcome.dealerTenpai;
      honba += 1;
      break;
    case "abortive":
      dealerStays = true;
      honba += 1;
      break;
    case "chombo":
      dealerStays = true;
      break;
  }
  if (!dealerStays) {
    dealer = nextSeat(dealer);
    kyoku += 1;
  }

  const next: GameState = { ...game, kyoku, honba, dealer };
  const inFinalKyoku = isFinalKyoku(game.kyoku, rules);

  if (anyTobi(next.points, rules)) return { ...next, status: "finished" };

  if (endGame) {
    const allowed =
      outcome.kind === "win"
        ? rules.progress.agariYame
        : outcome.kind === "draw" && rules.progress.tenpaiYame;
    if (!allowed) throw new DomainError("end_not_allowed", "当前规则不允许和了止/听牌止");
    if (!(inFinalKyoku && dealerStays && dealerIsSoleTop(game))) {
      throw new DomainError("end_condition", "仅最终局庄家连庄且为唯一一位时可以选择结束");
    }
    return { ...next, status: "finished" };
  }

  if (outcome.kind === "chombo") return next;

  const inExtra = game.kyoku > lastKyoku(rules);
  if (inExtra && reachedEnchousenTarget(next.points, rules)) return { ...next, status: "finished" };

  if (!dealerStays && kyoku > lastKyoku(rules)) {
    const canExtend =
      rules.progress.enchousen.enabled &&
      !reachedEnchousenTarget(next.points, rules) &&
      kyoku <= maxKyoku(rules);
    if (!canExtend) return { ...next, status: "finished" };
  }
  return next;
}
