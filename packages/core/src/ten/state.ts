import type { HandValue, ScoreTier } from "../scoring/basePoints";
import type { HandInput, PlayerRef } from "../types/state";
import type { Tile } from "../types/tiles";

/**
 * 《天》二人麻将（福本伸行《天 天和通りの快男児》）的对局模型。
 * 与四麻异构：无点棒转移，各自累计得分；按时间而非局数判胜负；一局分 A（比谁先听牌）/ B（猜和牌张）两阶段。
 * 座位 0 = 起家东、1 = 西；场风固定东。
 */
export type TenSeat = 0 | 1;

/** 开局每人的立直用千点棒：每个立直宣言扣 1 根，不返还、不计入得分，用完只能听牌宣言 */
export const TEN_STICKS = 10;
/** 对局时长；到时只提示，由人点「终局」 */
export const TEN_DURATION_MS = 60 * 60_000;

export type TenStage =
  | { kind: "A" }
  | {
      kind: "B";
      attacker: TenSeat;
      /** true = 立直，false = 听牌宣言 */
      riichi: boolean;
      /**
       * 全牌型板上被划掉的牌（基础牌码 1–34，升序）：防守方排除用的记号，点一下划掉、再点一下恢复。
       * 它只是便利，不管猜牌的流程——第几轮、每轮几张、是否命中都在牌桌上口头进行，不进模型。
       */
      marked: Tile[];
    };

export type TenDrawReason =
  /** Stage A：18 巡内无人宣言 */
  | "noDeclare"
  /** Stage B：防守方猜中待牌 */
  | "guessed"
  /** Stage B：摸到王牌仍未和 */
  | "exhausted";

interface TenEntryBase {
  seq: number;
  at: number;
  /** 第几局（从 1 起，流局也算一局） */
  round: number;
  honba: number;
  dealer: TenSeat;
  /** 当时两家昵称快照 */
  names: string[];
}

export type TenEntry = TenEntryBase &
  (
    | {
        kind: "tenTsumo";
        winner: TenSeat;
        riichi: boolean;
        value: HandValue;
        tier: ScoreTier;
        /** 本笔得分（含本场） */
        gain: number;
        yaku: Record<string, number> | null;
        hand: HandInput | null;
      }
    | {
        kind: "tenDraw";
        reason: TenDrawReason;
        attacker: TenSeat | null;
        riichi: boolean;
      }
  );

export interface TenFinal {
  scores: number[];
  /** 同分为 null */
  winner: TenSeat | null;
}

export interface TenGameState {
  status: "playing" | "finished";
  /** 开局时的两家快照 */
  players: PlayerRef[];
  scores: number[];
  /** 各家剩余的立直棒 */
  sticks: number[];
  dealer: TenSeat;
  honba: number;
  /** 当前是第几局（从 1 起） */
  round: number;
  stage: TenStage;
  history: TenEntry[];
  startedAt: number;
  finishedAt: number | null;
  final: TenFinal | null;
}
