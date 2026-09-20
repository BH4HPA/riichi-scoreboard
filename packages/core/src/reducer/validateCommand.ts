import { DomainError } from "../types/errors";
import { validateRules } from "../rules/validate";
import type { ClientCommand, ClientWinValue, RonWin } from "../types/commands";
import type { TenDrawReason } from "../ten/state";
import type { AbortiveReason, HandInput } from "../types/state";
import { ALL_TILES, MAX_TILE, type Seat } from "../types/tiles";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function bad(message: string): never {
  throw new DomainError("bad_command", message);
}

export function assertSeat(value: unknown, what = "座位"): asserts value is Seat {
  if (value !== 0 && value !== 1 && value !== 2 && value !== 3) bad(`${what}无效`);
}

function seat(v: unknown, what: string): Seat {
  assertSeat(v, what);
  return v;
}

function seatList(v: unknown, what: string): Seat[] {
  if (!Array.isArray(v) || v.length > 4) bad(`${what}无效`);
  const seats = v.map((s) => seat(s, what));
  if (new Set(seats).size !== seats.length) bad(`${what}重复`);
  return seats;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== "boolean") bad(`${what}必须是布尔值`);
  return v;
}

function int(v: unknown, what: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) bad(`${what}无效`);
  return v;
}

function tiles(v: unknown, what: string, max: number): number[] {
  if (!Array.isArray(v) || v.length > max) bad(`${what}无效`);
  return v.map((t) => int(t, what, 1, MAX_TILE));
}

/** 牌面输入的形状校验（WS 的 evaluate 消息也复用）。 */
export function validateHandShape(v: unknown): HandInput {
  return handInput(v);
}

function handInput(v: unknown): HandInput {
  if (!isRecord(v)) bad("牌面无效");
  if (!Array.isArray(v.melds) || v.melds.length > 4) bad("副露无效");
  return {
    closed: tiles(v.closed, "暗牌", 14),
    melds: v.melds.map((m) => {
      if (!isRecord(m)) bad("副露无效");
      return { open: bool(m.open, "副露明暗"), tiles: tiles(m.tiles, "副露牌", 4) };
    }),
    winTile: int(v.winTile, "和张", 1, MAX_TILE),
    tsumo: bool(v.tsumo, "自摸标记"),
    doraIndicators: tiles(v.doraIndicators, "宝牌指示牌", 5),
    uraIndicators: tiles(v.uraIndicators, "里宝指示牌", 5),
    riichi: bool(v.riichi, "立直"),
    doubleRiichi: bool(v.doubleRiichi, "两立直"),
    ippatsu: bool(v.ippatsu, "一发"),
    afterKan: bool(v.afterKan, "岭上/抢杠"),
    lastTile: bool(v.lastTile, "海底/河底"),
    firstTake: bool(v.firstTake, "首巡"),
  };
}

function winValue(v: unknown): ClientWinValue {
  if (!isRecord(v)) bad("和牌价值无效");
  if (v.kind === "manual") {
    return {
      kind: "manual",
      han: int(v.han, "番数", 0, 200),
      fu: int(v.fu, "符数", 0, 110),
      yakuman: int(v.yakuman, "役满倍数", 0, 6),
    };
  }
  if (v.kind === "hand") return { kind: "hand", hand: handInput(v.hand) };
  return bad("和牌价值类型无效");
}

function optionalSeat(v: unknown, what: string): { pao?: Seat } {
  return v === undefined ? {} : { pao: seat(v, what) };
}

function optionalEnd(v: unknown): { endGame?: boolean } {
  return v === undefined ? {} : { endGame: bool(v, "结束标记") };
}

const ABORTIVE: readonly AbortiveReason[] = ["kyuushu", "suufon", "suucha", "suukan", "sanchahou"];
const TEN_DRAWS: readonly TenDrawReason[] = ["noDeclare", "guessed", "exhausted"];

/**
 * 把客户端发来的任意 JSON 规范化为 ClientCommand；结构不对即抛 DomainError("bad_command")。
 * 只做形状校验，业务合法性（座位是否为空、规则是否允许）交给 reducer。
 */
export function validateCommand(input: unknown): ClientCommand {
  if (!isRecord(input) || typeof input.type !== "string") bad("命令格式错误");
  switch (input.type) {
    case "setRules":
      return { type: "setRules", rules: validateRules(input.rules) };
    case "sit":
      return { type: "sit", seat: seat(input.seat, "座位") };
    case "sitLocal": {
      if (typeof input.playerId !== "string" || !/^[a-f0-9]{1,32}$/.test(input.playerId))
        bad("本地玩家 id 无效");
      return { type: "sitLocal", seat: seat(input.seat, "座位"), playerId: input.playerId };
    }
    case "leave":
      return { type: "leave", seat: seat(input.seat, "座位") };
    case "setReady":
      return {
        type: "setReady",
        seat: seat(input.seat, "座位"),
        ready: bool(input.ready, "准备状态"),
      };
    case "start":
      return { type: "start", force: bool(input.force, "强开标记") };
    case "toLobby":
    case "dissolve":
    case "undo":
    case "redo":
    case "endGame":
    case "newGame":
      return { type: input.type };
    case "tsumo":
      return {
        type: "tsumo",
        winner: seat(input.winner, "自摸者"),
        value: winValue(input.value),
        riichi: seatList(input.riichi, "立直座位"),
        ...optionalSeat(input.pao, "包牌者"),
        ...optionalEnd(input.endGame),
      };
    case "ron": {
      if (!Array.isArray(input.wins) || input.wins.length < 1 || input.wins.length > 3)
        bad("荣和者无效");
      const wins: RonWin<ClientWinValue>[] = input.wins.map((w) => {
        if (!isRecord(w)) bad("荣和者无效");
        return {
          winner: seat(w.winner, "荣和者"),
          value: winValue(w.value),
          ...optionalSeat(w.pao, "包牌者"),
        };
      });
      return {
        type: "ron",
        loser: seat(input.loser, "放铳者"),
        wins,
        riichi: seatList(input.riichi, "立直座位"),
        ...optionalEnd(input.endGame),
      };
    }
    case "draw": {
      if (!Array.isArray(input.tenpai) || input.tenpai.length !== 4) bad("听牌标记无效");
      return {
        type: "draw",
        tenpai: input.tenpai.map((t) => bool(t, "听牌标记")),
        riichi: seatList(input.riichi, "立直座位"),
        nagashi: seatList(input.nagashi ?? [], "流局满贯座位"),
        ...optionalEnd(input.endGame),
      };
    }
    case "abortive": {
      if (!ABORTIVE.includes(input.reason as AbortiveReason)) bad("途中流局原因无效");
      return {
        type: "abortive",
        reason: input.reason as AbortiveReason,
        riichi: seatList(input.riichi, "立直座位"),
      };
    }
    case "chombo":
      return { type: "chombo", offender: seat(input.offender, "错和者") };
    case "declareRiichi":
      return {
        type: "declareRiichi",
        seat: seat(input.seat, "立直座位"),
        kyoku: int(input.kyoku, "局数", 0, 99),
        honba: int(input.honba, "本场数", 0, 999),
        entries: int(input.entries, "历史条数", 0, 100_000),
      };
    case "adjust":
      return {
        type: "adjust",
        kyoku: int(input.kyoku, "局序号", 0, 15),
        honba: int(input.honba, "本场数", 0, 99),
      };
    case "tenDeclare":
      return {
        type: "tenDeclare",
        seat: seat(input.seat, "宣言座位"),
        riichi: bool(input.riichi, "立直标记"),
        entries: int(input.entries, "历史条数", 0, 100_000),
      };
    case "tenGuess": {
      const picked = input.tiles;
      if (!Array.isArray(picked) || picked.length !== 2) bad("指定的牌必须是两张");
      const max = ALL_TILES.length;
      return {
        type: "tenGuess",
        tiles: [int(picked[0], "指定的牌", 1, max), int(picked[1], "指定的牌", 1, max)],
      };
    }
    case "tenDraw":
      if (!TEN_DRAWS.includes(input.reason as TenDrawReason)) bad("流局原因无效");
      return { type: "tenDraw", reason: input.reason as TenDrawReason };
    case "tenTsumo":
      return { type: "tenTsumo", value: winValue(input.value) };
    default:
      return bad(`未知命令 ${input.type}`);
  }
}
