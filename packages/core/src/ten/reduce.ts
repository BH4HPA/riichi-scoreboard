import { assertValue } from "../reducer/game";
import { effectiveYakuman, scoreTier } from "../scoring/basePoints";
import { winPoints } from "../scoring/winPoints";
import type { TenCommand } from "../types/commands";
import { DomainError } from "../types/errors";
import type { RoomRules } from "../types/rules";
import type { PlayerRef } from "../types/state";
import { ALL_TILES } from "../types/tiles";
import { TEN_STICKS, type TenEntry, type TenGameState, type TenSeat } from "./state";

export interface TenContext {
  seq: number;
  at: number;
  names: string[];
  rules: RoomRules;
}

export function createTenGame(players: PlayerRef[], startedAt: number): TenGameState {
  return {
    status: "playing",
    players,
    scores: [0, 0],
    sticks: [TEN_STICKS, TEN_STICKS],
    dealer: 0,
    honba: 0,
    round: 1,
    stage: { kind: "A" },
    history: [],
    startedAt,
    finishedAt: null,
    final: null,
  };
}

function assertTenSeat(value: unknown, what: string): asserts value is TenSeat {
  if (value !== 0 && value !== 1) throw new DomainError("bad_seat", `${what}无效`);
}

function entryBase(game: TenGameState, ctx: TenContext) {
  return {
    seq: ctx.seq,
    at: ctx.at,
    round: game.round,
    honba: game.honba,
    dealer: game.dealer,
    names: [...ctx.names],
  };
}

/** 一局记完：回到 Stage A，局数 +1。庄家与本场由调用方按结果给。 */
function nextRound(
  game: TenGameState,
  entry: TenEntry,
  patch: Pick<TenGameState, "dealer" | "honba"> & Partial<Pick<TenGameState, "scores">>,
): TenGameState {
  return {
    ...game,
    ...patch,
    round: game.round + 1,
    stage: { kind: "A" },
    history: [entry, ...game.history],
  };
}

/**
 * 二人房的对局命令。宣言是普通的可撤销步骤（由房间层入撤销栈）：点错了撤销即可，不另设取消；
 * 划牌（`tenMark`）由房间层替换 present、不入撤销栈。
 * 返回同一个对象表示没有状态变化（重复的宣言 / 划牌），房间层据此不落库、不广播。
 */
export function applyTenCommand(
  game: TenGameState,
  cmd: TenCommand | { type: "endGame" },
  ctx: TenContext,
): TenGameState {
  if (game.status === "finished") throw new DomainError("finished", "对局已结束");
  const { stage } = game;

  switch (cmd.type) {
    case "tenDeclare": {
      assertTenSeat(cmd.seat, "宣言座位");
      if (stage.kind === "B") {
        if (stage.attacker === cmd.seat && stage.riichi === cmd.riichi) return game;
        throw new DomainError(
          "declared",
          stage.attacker === cmd.seat ? "本局已宣言；要改请先撤销" : "对方已宣言",
        );
      }
      if (cmd.entries !== game.history.length) {
        throw new DomainError("stale_round", "局面已变化，宣言没有记上，请确认后重按");
      }
      if (!cmd.riichi) {
        return { ...game, stage: { kind: "B", attacker: cmd.seat, riichi: false, marked: [] } };
      }
      if (game.sticks[cmd.seat]! <= 0) {
        throw new DomainError("no_sticks", "立直棒已用完，只能听牌宣言");
      }
      return {
        ...game,
        sticks: game.sticks.map((n, s) => (s === cmd.seat ? n - 1 : n)),
        stage: { kind: "B", attacker: cmd.seat, riichi: true, marked: [] },
      };
    }

    case "tenMark": {
      if (stage.kind !== "B") throw new DomainError("not_stage", "还没有人宣言");
      if (cmd.entries !== game.history.length) {
        throw new DomainError("stale_round", "局面已变化，请重试");
      }
      if (!ALL_TILES.includes(cmd.tile)) throw new DomainError("bad_tiles", "没有这张牌");
      if (stage.marked.includes(cmd.tile) === cmd.on) return game;
      const marked = cmd.on
        ? [...stage.marked, cmd.tile].sort((x, y) => x - y)
        : stage.marked.filter((t) => t !== cmd.tile);
      return { ...game, stage: { ...stage, marked } };
    }

    case "tenDraw": {
      if (cmd.reason === "noDeclare") {
        if (stage.kind !== "A")
          throw new DomainError("not_stage", "已有人宣言，不是无人宣言的流局");
      } else if (stage.kind !== "B") {
        throw new DomainError("not_stage", "还没有人宣言");
      }
      const entry: TenEntry = {
        ...entryBase(game, ctx),
        kind: "tenDraw",
        reason: cmd.reason,
        attacker: stage.kind === "B" ? stage.attacker : null,
        riichi: stage.kind === "B" && stage.riichi,
      };
      // 流局：庄家不变，积棒 +1
      return nextRound(game, entry, { dealer: game.dealer, honba: game.honba + 1 });
    }

    case "tenTsumo": {
      // 和牌只发生在 Stage B：防守方没猜中，进攻方在 5 摸内自摸
      if (stage.kind !== "B") throw new DomainError("not_stage", "还没有人宣言，不能和牌");
      const value = assertValue(cmd.value);
      if (cmd.value.kind === "hand") {
        const { hand } = cmd.value;
        if (!hand.tsumo) throw new DomainError("bad_value", "二人麻将只有自摸和");
        if ((hand.riichi || hand.doubleRiichi) !== stage.riichi) {
          throw new DomainError(
            "riichi_mismatch",
            stage.riichi ? "本局是立直宣言，手牌需要勾立直" : "本局是听牌宣言，手牌不能勾立直",
          );
        }
      }
      const winner = stage.attacker;
      const dealerWon = winner === game.dealer;
      // 得分 = 四麻自摸的总收入（含本场）：借现有支付函数，不另立点数表
      const gain = winPoints(
        value,
        { dealer: dealerWon, tsumo: true, honba: game.honba },
        ctx.rules,
      ).total;
      const entry: TenEntry = {
        ...entryBase(game, ctx),
        kind: "tenTsumo",
        winner,
        riichi: stage.riichi,
        value: { ...value, yakuman: effectiveYakuman(value, ctx.rules) },
        tier: scoreTier(value, ctx.rules),
        gain,
        yaku: cmd.value.kind === "hand" ? cmd.value.result.yaku : null,
        hand: cmd.value.kind === "hand" ? cmd.value.hand : null,
      };
      return nextRound(game, entry, {
        scores: game.scores.map((n, s) => (s === winner ? n + gain : n)),
        // 闲家不和则庄家不变：庄家和连庄积棒 +1；闲家和换庄、积棒清零
        dealer: winner,
        honba: dealerWon ? game.honba + 1 : 0,
      });
    }

    case "endGame": {
      // A、B 都可以终局（到时提示多半出现在 B 中途）：阶段原样留在快照里，撤销终局能接着打；未记完的这一局不进历史
      const [east, west] = game.scores as [number, number];
      return {
        ...game,
        status: "finished",
        finishedAt: ctx.at,
        final: { scores: [...game.scores], winner: east === west ? null : east > west ? 0 : 1 },
      };
    }

    default:
      throw new DomainError("bad_command", `未知命令 ${(cmd as { type: string }).type}`);
  }
}
