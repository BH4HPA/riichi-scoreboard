import { YAKU_PAGES } from "../reference/yakuTable";
import { assertSeat, validateHandShape } from "../reducer/validateCommand";
import { TEN_GUIDE_KEYS } from "../ten/guide";
import { DomainError } from "../types/errors";
import type { EvaluatedHand, HandInput } from "../types/state";
import type { Seat } from "../types/tiles";

/** 结算镜像里的一位和牌者：牌面只在录满并算出结果后才携带。 */
export interface SettlementWinView {
  winner: Seat;
  valueText: string | null;
  hand: HandInput | null;
  evaluated: EvaluatedHand | null;
}

/** 手机端当前打开的界面，供电视镜像。 */
export type UiIntent =
  | { kind: "none" }
  | {
      kind: "settlement";
      mode: "tsumo" | "ron" | "draw" | "abortive" | "chombo";
      deltas: number[] | null;
      summary: string | null;
      loser: Seat | null;
      riichi: Seat[];
      wins: SettlementWinView[];
    }
  | { kind: "reference"; tab: ReferenceTab; sub: string }
  | { kind: "rules" }
  | { kind: "adjust" }
  /** 二人房的结算：和牌者恒为进攻方、得分只加给自己，所以没有四家点数变动 */
  | {
      kind: "tenSettlement";
      mode: "tsumo" | "draw";
      summary: string | null;
      /** 本笔得分；还没录全为 null */
      gain: number | null;
      win: SettlementWinView | null;
    }
  /** 《天》规则说明的某一页：大厅与对局中都可以投 */
  | { kind: "tenGuide"; page: string };

export type ReferenceTab = "yaku" | "points";
/** 番符表二级页：役种页按 YAKU_PAGES.key；点数页为 ko / oya / fu */
export interface ReferenceView {
  tab: ReferenceTab;
  sub: string;
}
export const DEFAULT_REFERENCE_VIEW: ReferenceView = { tab: "yaku", sub: "1" };
export const POINTS_SUBS = ["ko", "oya", "fu"] as const;

const SETTLEMENT_MODES = ["tsumo", "ron", "draw", "abortive", "chombo"] as const;
const TEN_SETTLEMENT_MODES = ["tsumo", "draw"] as const;
const REFERENCE_TABS = ["yaku", "points"] as const;
const REFERENCE_SUBS: Record<ReferenceTab, readonly string[]> = {
  yaku: YAKU_PAGES.map((p) => p.key),
  points: POINTS_SUBS,
};
const SUMMARY_MAX = 200;

const MAX_YAKU_ENTRIES = 20;

function badIntent(): never {
  throw new DomainError("bad_intent", "镜像意图格式错误");
}

function seatListOrBad(v: unknown): Seat[] {
  if (!Array.isArray(v) || v.length > 4) return badIntent();
  for (const s of v) assertSeat(s);
  return v as Seat[];
}

/** 引擎结果的形状校验（镜像用，不做业务判断）。 */
function evaluatedOrBad(v: unknown): EvaluatedHand {
  if (typeof v !== "object" || v === null) return badIntent();
  const r = v as Record<string, unknown>;
  const int = (x: unknown, max: number) =>
    typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= max ? x : badIntent();
  if (typeof r.isAgari !== "boolean") return badIntent();
  if (typeof r.yaku !== "object" || r.yaku === null) return badIntent();
  const entries = Object.entries(r.yaku as Record<string, unknown>);
  if (entries.length > MAX_YAKU_ENTRIES) return badIntent();
  const yaku: Record<string, number> = {};
  for (const [k, n] of entries) {
    if (k.length > 32) return badIntent();
    yaku[k] = int(n, 200);
  }
  const reason = r.reason;
  if (reason !== undefined && reason !== "noYaku" && reason !== "notAgari") return badIntent();
  return {
    han: int(r.han, 200),
    fu: int(r.fu, 110),
    yakuman: int(r.yakuman, 6),
    yaku,
    isAgari: r.isAgari,
    ...(reason === undefined ? {} : { reason }),
  };
}

function winViewOrBad(w: unknown): SettlementWinView {
  if (typeof w !== "object" || w === null) return badIntent();
  const r = w as Record<string, unknown>;
  assertSeat(r.winner);
  if (r.valueText !== null && typeof r.valueText !== "string") return badIntent();
  return {
    winner: r.winner,
    valueText: typeof r.valueText === "string" ? r.valueText.slice(0, SUMMARY_MAX) : null,
    hand: r.hand === null ? null : validateHandShape(r.hand),
    evaluated: r.evaluated === null ? null : evaluatedOrBad(r.evaluated),
  };
}

function summaryOrBad(v: unknown): string | null {
  if (v !== null && typeof v !== "string") return badIntent();
  return typeof v === "string" ? v.slice(0, SUMMARY_MAX) : null;
}

/** 校验并规范化客户端发来的镜像意图；形状不对即抛 DomainError。 */
export function validateUiIntent(input: unknown): UiIntent {
  const bad = badIntent;
  if (typeof input !== "object" || input === null) return bad();
  const v = input as Record<string, unknown>;
  switch (v.kind) {
    case "none":
    case "rules":
    case "adjust":
      return { kind: v.kind };
    case "reference": {
      if (!REFERENCE_TABS.includes(v.tab as ReferenceTab)) return bad();
      const tab = v.tab as ReferenceTab;
      if (typeof v.sub !== "string" || !REFERENCE_SUBS[tab].includes(v.sub)) return bad();
      return { kind: "reference", tab, sub: v.sub };
    }
    case "settlement": {
      if (!SETTLEMENT_MODES.includes(v.mode as (typeof SETTLEMENT_MODES)[number])) return bad();
      const deltas = v.deltas;
      if (
        deltas !== null &&
        (!Array.isArray(deltas) || deltas.length !== 4 || !deltas.every((d) => Number.isFinite(d)))
      ) {
        return bad();
      }
      const summary = v.summary;
      if (summary !== null && typeof summary !== "string") return bad();
      if (v.loser !== null) assertSeat(v.loser);
      const riichi = seatListOrBad(v.riichi);
      if (!Array.isArray(v.wins) || v.wins.length > 3) return bad();
      const wins = v.wins.map(winViewOrBad);
      return {
        kind: "settlement",
        mode: v.mode as (typeof SETTLEMENT_MODES)[number],
        deltas: deltas as number[] | null,
        summary: typeof summary === "string" ? summary.slice(0, SUMMARY_MAX) : null,
        loser: v.loser as Seat | null,
        riichi,
        wins,
      };
    }
    case "tenSettlement": {
      const mode = v.mode as (typeof TEN_SETTLEMENT_MODES)[number];
      if (!TEN_SETTLEMENT_MODES.includes(mode)) return bad();
      const gain = v.gain;
      if (gain !== null && (typeof gain !== "number" || !Number.isFinite(gain))) return bad();
      return {
        kind: "tenSettlement",
        mode,
        summary: summaryOrBad(v.summary),
        gain,
        win: v.win === null ? null : winViewOrBad(v.win),
      };
    }
    case "tenGuide":
      if (typeof v.page !== "string" || !TEN_GUIDE_KEYS.includes(v.page)) return bad();
      return { kind: "tenGuide", page: v.page };
    default:
      return bad();
  }
}

export interface UiState {
  playerId: string | null;
  seat: Seat | null;
  name: string;
  intent: UiIntent;
  at: number;
}
