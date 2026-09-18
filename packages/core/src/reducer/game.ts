import { settleFinal, standings } from "../final/settle";
import { DomainError } from "../types/errors";
import { advance, maxKyoku, type Outcome } from "../progress/advance";
import { calcBasePoints, effectiveYakuman, scoreTier, type HandValue } from "../scoring/basePoints";
import {
  applyDeltas,
  chomboPayment,
  drawDeltas,
  ronPayment,
  sticksCollector,
  tsumoPayment,
} from "../scoring/payments";
import type { GameCommand } from "../types/commands";
import type { RoomRules } from "../types/rules";
import {
  dealerOf,
  type GameState,
  type HistoryEntry,
  type PlayerRef,
  type WinRecord,
  type WinValue,
} from "../types/state";
import { SEATS, type Seat } from "../types/tiles";
import { assertSeat } from "./validateCommand";

export interface GameContext {
  seq: number;
  at: number;
  names: string[];
  rules: RoomRules;
}

export function createGame(rules: RoomRules, players: PlayerRef[], startedAt: number): GameState {
  return {
    status: "playing",
    players,
    points: SEATS.map(() => rules.final.startPoints),
    kyotaku: 0,
    honba: 0,
    kyoku: 0,
    riichi: SEATS.map(() => false),
    history: [],
    tobi: null,
    startedAt,
    finishedAt: null,
    final: null,
  };
}

function handValue(value: WinValue): HandValue {
  if (value.kind === "manual") return { han: value.han, fu: value.fu, yakuman: value.yakuman };
  return { han: value.result.han, fu: value.result.fu, yakuman: value.result.yakuman };
}

function assertValue(value: WinValue): HandValue {
  const v = handValue(value);
  if (value.kind === "hand" && !value.result.isAgari) {
    throw new DomainError(
      "not_agari",
      value.result.reason === "noYaku" ? "该牌型无役" : "该牌型不是和牌形",
    );
  }
  if (v.yakuman < 0 || v.yakuman > 6) throw new DomainError("bad_value", "役满倍数无效");
  if (v.yakuman === 0) {
    if (!Number.isInteger(v.han) || v.han < 1)
      throw new DomainError("bad_value", "番数必须是正整数");
    if (!Number.isInteger(v.fu) || v.fu < 20 || v.fu > 110 || (v.fu % 10 !== 0 && v.fu !== 25)) {
      throw new DomainError("bad_value", "符数无效");
    }
  }
  return v;
}

function assertPao(
  pao: Seat | undefined,
  winner: Seat,
  value: HandValue,
  rules: RoomRules,
): Seat | undefined {
  if (pao === undefined) return undefined;
  assertSeat(pao, "包牌者");
  if (!rules.scoring.pao) throw new DomainError("pao_disabled", "当前规则无包牌");
  if (pao === winner) throw new DomainError("bad_pao", "包牌者不能是和牌者");
  if (value.yakuman === 0) throw new DomainError("pao_requires_yakuman", "包牌仅适用于役满");
  return pao;
}

/** 该座位此刻能否立直（点数规则）；结算校验、立直声明与手机立直键共用。 */
export function canRiichi(game: GameState, rules: RoomRules, seat: Seat): boolean {
  return rules.progress.riichiBelow1000 || game.points[seat]! >= 1000;
}

function assertRiichi(game: GameState, riichi: readonly Seat[], rules: RoomRules): void {
  for (const seat of riichi) {
    assertSeat(seat, "立直座位");
    if (!canRiichi(game, rules, seat)) {
      throw new DomainError("riichi_points", "点数不足 1000 不能立直");
    }
  }
  if (new Set(riichi).size !== riichi.length) throw new DomainError("bad_riichi", "立直座位重复");
}

function baseEntry(game: GameState, ctx: GameContext, deltas: number[], riichi: Seat[]) {
  return {
    seq: ctx.seq,
    at: ctx.at,
    kyoku: game.kyoku,
    honba: game.honba,
    dealer: dealerOf(game.kyoku),
    names: [...ctx.names],
    deltas,
    riichi: [...riichi],
  };
}

function detectTobi(
  before: readonly number[],
  after: readonly number[],
  by: Seat | null,
  rules: RoomRules,
) {
  if (!rules.progress.tobi.enabled) return null;
  const limit = rules.progress.tobi.threshold === "at0" ? 0 : -1;
  const seat = SEATS.find((s) => after[s]! <= limit && before[s]! > limit);
  return seat === undefined ? null : { seat, by };
}

function finish(game: GameState, ctx: GameContext): GameState {
  const final = settleFinal(game.points, game.kyotaku, ctx.rules, game.tobi);
  const history = [...game.history];
  if (game.kyotaku > 0) {
    const to = ctx.rules.final.leftoverKyotaku === "top" ? standings(game.points)[0]! : null;
    history.unshift({
      ...baseEntry(game, ctx, final.kyotakuDeltas, []),
      kind: "kyotaku",
      to,
      amount: game.kyotaku * 1000,
    });
  }
  return {
    ...game,
    status: "finished",
    points: final.points,
    kyotaku: 0,
    history,
    finishedAt: ctx.at,
    final,
  };
}

function settleRound(
  game: GameState,
  ctx: GameContext,
  entry: HistoryEntry,
  nextKyotaku: number,
  outcome: Outcome,
  tobiBy: Seat | null,
  endGame: boolean,
): GameState {
  const points = applyDeltas(game.points, entry.deltas);
  const tobi = game.tobi ?? detectTobi(game.points, points, tobiBy, ctx.rules);
  const withRound: GameState = {
    ...game,
    points,
    kyotaku: nextKyotaku,
    history: [entry, ...game.history],
    tobi,
  };
  const advanced = advance(withRound, outcome, ctx.rules, endGame);
  return advanced.status === "finished" ? finish(advanced, ctx) : advanced;
}

function makeWinRecord(
  winner: Seat,
  value: WinValue,
  pao: Seat | undefined,
  rules: RoomRules,
  payment: WinRecord["payment"],
): WinRecord {
  const v = handValue(value);
  return {
    winner,
    value: { ...v, yakuman: effectiveYakuman(v, rules) },
    tier: scoreTier(v, rules),
    payment,
    yaku: value.kind === "hand" ? value.result.yaku : null,
    hand: value.kind === "hand" ? value.hand : null,
    pao: pao ?? null,
  };
}

/** 声明立直：幂等（已声明原样返回同一对象）；局面已变、对局结束或点数不足时拒绝。 */
export function declareRiichi(
  game: GameState,
  cmd: Extract<GameCommand, { type: "declareRiichi" }>,
  rules: RoomRules,
): GameState {
  const { seat } = cmd;
  assertSeat(seat, "立直座位");
  if (game.status === "finished") throw new DomainError("finished", "对局已结束");
  if (cmd.kyoku !== game.kyoku || cmd.honba !== game.honba || cmd.entries !== game.history.length) {
    throw new DomainError("stale_round", "局面已变化，立直没有记上，请确认后重按");
  }
  if (!canRiichi(game, rules, seat)) {
    throw new DomainError("riichi_points", "点数不足 1000 不能立直");
  }
  if (game.riichi[seat]) return game;
  return { ...game, riichi: game.riichi.map((r, s) => r || s === seat) };
}

/**
 * 命令结算后的立直声明：换局即作废。调整场况只在局数或本场变化时清（改点数之类不影响本局声明）。
 */
function riichiAfter(prev: GameState, next: GameState, cmd: GameCommand): GameState {
  if (cmd.type === "adjust" && next.kyoku === prev.kyoku && next.honba === prev.honba) return next;
  return { ...next, riichi: SEATS.map(() => false) };
}

export function applyGameCommand(game: GameState, cmd: GameCommand, ctx: GameContext): GameState {
  return riichiAfter(game, settleCommand(game, cmd, ctx), cmd);
}

function settleCommand(game: GameState, cmd: GameCommand, ctx: GameContext): GameState {
  const { rules } = ctx;
  const dealer = dealerOf(game.kyoku);
  if (game.status === "finished" && cmd.type !== "adjust") {
    throw new DomainError("finished", "对局已结束");
  }

  switch (cmd.type) {
    case "tsumo": {
      assertSeat(cmd.winner, "自摸者");
      const v = assertValue(cmd.value);
      assertRiichi(game, cmd.riichi, rules);
      const pao = assertPao(cmd.pao, cmd.winner, v, rules);
      const base = calcBasePoints(v, rules);
      const payment = tsumoPayment(
        {
          winner: cmd.winner,
          dealer,
          base,
          honba: game.honba,
          kyotaku: game.kyotaku,
          riichi: cmd.riichi,
          pao,
        },
        rules,
      );
      const entry: HistoryEntry = {
        ...baseEntry(game, ctx, payment.deltas, cmd.riichi),
        kind: "tsumo",
        win: makeWinRecord(cmd.winner, cmd.value, pao, rules, payment),
      };
      return settleRound(
        game,
        ctx,
        entry,
        0,
        { kind: "win", dealerWon: cmd.winner === dealer },
        cmd.winner,
        cmd.endGame ?? false,
      );
    }

    case "ron": {
      assertSeat(cmd.loser, "放铳者");
      assertRiichi(game, cmd.riichi, rules);
      const limit = { atamahane: 1, double: 2, triple: 3 }[rules.win.multiRon];
      if (cmd.wins.length < 1) throw new DomainError("bad_ron", "至少一名荣和者");
      if (cmd.wins.length > limit) {
        throw new DomainError(
          "multi_ron",
          limit === 1 ? "当前规则为头跳，只能有一名荣和者" : `当前规则最多 ${limit} 家荣和`,
        );
      }
      const winners = cmd.wins.map((w) => w.winner);
      if (new Set(winners).size !== winners.length || winners.includes(cmd.loser)) {
        throw new DomainError("bad_ron", "荣和者与放铳者不能重复");
      }
      const collector = sticksCollector(winners, cmd.loser);
      const deltas = [0, 0, 0, 0];
      const wins: WinRecord[] = [];
      for (const w of cmd.wins) {
        assertSeat(w.winner, "荣和者");
        const v = assertValue(w.value);
        const pao = assertPao(w.pao, w.winner, v, rules);
        const payment = ronPayment(
          {
            winner: w.winner,
            loser: cmd.loser,
            dealer,
            base: calcBasePoints(v, rules),
            honba: game.honba,
            kyotaku: game.kyotaku,
            riichi: cmd.riichi,
            collectsSticks: w.winner === collector,
            pao,
          },
          rules,
        );
        for (const s of SEATS) deltas[s]! += payment.deltas[s]!;
        wins.push(makeWinRecord(w.winner, w.value, pao, rules, payment));
      }
      const entry: HistoryEntry = {
        ...baseEntry(game, ctx, deltas, cmd.riichi),
        kind: "ron",
        loser: cmd.loser,
        wins,
      };
      return settleRound(
        game,
        ctx,
        entry,
        0,
        { kind: "win", dealerWon: winners.includes(dealer) },
        collector,
        cmd.endGame ?? false,
      );
    }

    case "draw": {
      if (cmd.tenpai.length !== 4) throw new DomainError("bad_draw", "听牌标记必须是 4 项");
      assertRiichi(game, cmd.riichi, rules);
      if (cmd.nagashi.length > 0 && !rules.hand.nagashiMangan) {
        throw new DomainError("nagashi_disabled", "当前规则无流局满贯");
      }
      for (const s of cmd.nagashi) assertSeat(s, "流局满贯座位");
      const draw = drawDeltas(cmd.tenpai, cmd.riichi, cmd.nagashi, dealer, game.honba, rules);
      const entry: HistoryEntry = {
        ...baseEntry(game, ctx, draw.deltas, cmd.riichi),
        kind: "draw",
        tenpai: draw.tenpai,
        noten: draw.noten,
        nagashi: [...cmd.nagashi],
        riichiIncome: draw.riichiIncome,
      };
      const dealerTenpai = cmd.tenpai[dealer] === true;
      return settleRound(
        game,
        ctx,
        entry,
        game.kyotaku + cmd.riichi.length,
        { kind: "draw", dealerTenpai },
        null,
        cmd.endGame ?? false,
      );
    }

    case "abortive": {
      if (!rules.progress.abortiveDraws)
        throw new DomainError("abortive_disabled", "当前规则无途中流局");
      assertRiichi(game, cmd.riichi, rules);
      const deltas = [0, 0, 0, 0];
      for (const s of cmd.riichi) deltas[s]! -= 1000;
      const entry: HistoryEntry = {
        ...baseEntry(game, ctx, deltas, cmd.riichi),
        kind: "abortive",
        reason: cmd.reason,
      };
      return settleRound(
        game,
        ctx,
        entry,
        game.kyotaku + cmd.riichi.length,
        { kind: "abortive" },
        null,
        false,
      );
    }

    case "chombo": {
      if (rules.progress.chombo === "none")
        throw new DomainError("chombo_disabled", "当前规则无错和罚符");
      assertSeat(cmd.offender, "错和者");
      const deltas = chomboPayment(cmd.offender, dealer);
      const entry: HistoryEntry = {
        ...baseEntry(game, ctx, deltas, []),
        kind: "chombo",
        offender: cmd.offender,
      };
      return settleRound(game, ctx, entry, game.kyotaku, { kind: "chombo" }, null, false);
    }

    case "adjust": {
      if (!Number.isInteger(cmd.kyoku) || cmd.kyoku < 0 || cmd.kyoku > maxKyoku(rules)) {
        throw new DomainError("bad_kyoku", "局数超出规则范围");
      }
      if (!Number.isInteger(cmd.honba) || cmd.honba < 0)
        throw new DomainError("bad_honba", "本场数无效");
      const entry: HistoryEntry = {
        ...baseEntry(game, ctx, [0, 0, 0, 0], []),
        kind: "adjust",
        to: { kyoku: cmd.kyoku, honba: cmd.honba },
      };
      return {
        ...game,
        status: "playing",
        finishedAt: null,
        final: null,
        kyoku: cmd.kyoku,
        honba: cmd.honba,
        history: [entry, ...game.history],
      };
    }

    case "endGame":
      return finish(game, ctx);

    case "undo":
    case "redo":
    case "newGame":
    case "declareRiichi":
      throw new DomainError("not_here", `${cmd.type} 由房间层处理`);

    default:
      throw new DomainError("bad_command", `未知命令 ${(cmd as { type: string }).type}`);
  }
}
