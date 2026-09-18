import { assertSeat, validateHandShape } from "../reducer/validateCommand";
import { validateRules } from "../rules/validate";
import { DomainError } from "../types/errors";
import type { RoomRules } from "../types/rules";
import type { HandInput, PlayerRef } from "../types/state";
import type { Wind } from "../types/tiles";

/** 房间外算番（`POST /api/evaluate`，拍照算点数页）：规则与场况都由请求自带。 */
export interface EvaluateRequest {
  hand: HandInput;
  rules: RoomRules;
  roundWind: Wind;
  /** 和牌者自风：东 = 庄家 */
  seatWind: Wind;
}

/** 牌面形状错抛 `DomainError`，规则错抛 `RulesError`。 */
export function validateEvaluateRequest(input: unknown): EvaluateRequest {
  if (typeof input !== "object" || input === null) {
    throw new DomainError("bad_request", "请求无效");
  }
  const v = input as Record<string, unknown>;
  const hand = validateHandShape(v.hand);
  const rules = validateRules(v.rules);
  assertSeat(v.roundWind, "场风");
  assertSeat(v.seatWind, "自风");
  return { hand, rules, roundWind: v.roundWind, seatWind: v.seatWind };
}

/** 主控台管理的本地玩家（REST DTO）。 */
export interface LocalPlayerView extends PlayerRef {
  /** 已完成对局数 */
  games: number;
}

export interface PlayerStats {
  games: number;
  averageRank: number | null;
  totalScore: number;
  rankCounts: [number, number, number, number];
  recent: Array<{
    roomCode: string;
    gameNo: number;
    finishedAt: number;
    points: number;
    rank: number;
    score: number;
  }>;
}
