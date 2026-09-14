import type { RoomRules } from "../types/rules";
import { MLEAGUE_RULES } from "./mleague";

export class RulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RulesError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
  if (typeof v === "string" && (options as readonly string[]).includes(v)) return v as T;
  throw new RulesError(`${path} 必须是 ${options.join("/")}`);
}

function bool(v: unknown, path: string): boolean {
  if (typeof v === "boolean") return v;
  throw new RulesError(`${path} 必须是布尔值`);
}

function int(v: unknown, path: string, min: number, max: number): number {
  if (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max) return v;
  throw new RulesError(`${path} 必须是 ${min}..${max} 的整数`);
}

function section(v: unknown, path: string): Record<string, unknown> {
  if (isRecord(v)) return v;
  throw new RulesError(`${path} 缺失`);
}

/** 校验并规范化外部传入的规则对象；字段全部必填，避免"半套规则"进入房间。 */
export function validateRules(input: unknown): RoomRules {
  const root = section(input, "rules");
  const scoring = section(root.scoring, "scoring");
  const hand = section(root.hand, "hand");
  const win = section(root.win, "win");
  const progress = section(root.progress, "progress");
  const tobi = section(progress.tobi, "progress.tobi");
  const enchousen = section(progress.enchousen, "progress.enchousen");
  const final = section(root.final, "final");

  const uma = final.uma;
  if (!Array.isArray(uma) || uma.length !== 4 || !uma.every((n) => Number.isInteger(n))) {
    throw new RulesError("final.uma 必须是 4 个整数");
  }
  const startPoints = int(final.startPoints, "final.startPoints", 0, 100000);
  const returnPoints = int(final.returnPoints, "final.returnPoints", 0, 100000);
  if (returnPoints < startPoints) throw new RulesError("返点不能低于起始点");
  if (startPoints % 100 !== 0 || returnPoints % 100 !== 0) {
    throw new RulesError("起始点与返点必须是 100 的倍数");
  }

  const akaCount = int(hand.akaCount, "hand.akaCount", 0, 4);
  if (akaCount !== 0 && akaCount !== 3 && akaCount !== 4) {
    throw new RulesError("hand.akaCount 必须是 0/3/4");
  }

  return {
    scoring: {
      kiriageMangan: bool(scoring.kiriageMangan, "scoring.kiriageMangan"),
      kazoeYakuman: bool(scoring.kazoeYakuman, "scoring.kazoeYakuman"),
      doubleYakuman: bool(scoring.doubleYakuman, "scoring.doubleYakuman"),
      yakumanStacking: bool(scoring.yakumanStacking, "scoring.yakumanStacking"),
      pao: bool(scoring.pao, "scoring.pao"),
      honbaValue: int(scoring.honbaValue, "scoring.honbaValue", 0, 10000),
      notenBappu: int(scoring.notenBappu, "scoring.notenBappu", 0, 10000),
    },
    hand: {
      akaCount,
      uraDora: bool(hand.uraDora, "hand.uraDora"),
      kanDora: bool(hand.kanDora, "hand.kanDora"),
      kuitan: bool(hand.kuitan, "hand.kuitan"),
      ippatsu: bool(hand.ippatsu, "hand.ippatsu"),
      renhou: oneOf(hand.renhou, ["none", "mangan", "yakuman"], "hand.renhou"),
      nagashiMangan: bool(hand.nagashiMangan, "hand.nagashiMangan"),
      kokushiAnkanChankan: bool(hand.kokushiAnkanChankan, "hand.kokushiAnkanChankan"),
    },
    win: {
      multiRon: oneOf(win.multiRon, ["atamahane", "double", "triple"], "win.multiRon"),
    },
    progress: {
      length: oneOf(progress.length, ["east", "hanchan"], "progress.length"),
      tobi: {
        enabled: bool(tobi.enabled, "progress.tobi.enabled"),
        threshold: oneOf(tobi.threshold, ["below0", "at0"], "progress.tobi.threshold"),
        bonus: int(tobi.bonus, "progress.tobi.bonus", 0, 100),
      },
      enchousen: {
        enabled: bool(enchousen.enabled, "progress.enchousen.enabled"),
        threshold: int(enchousen.threshold, "progress.enchousen.threshold", 0, 100000),
      },
      agariYame: bool(progress.agariYame, "progress.agariYame"),
      tenpaiYame: bool(progress.tenpaiYame, "progress.tenpaiYame"),
      abortiveDraws: bool(progress.abortiveDraws, "progress.abortiveDraws"),
      chombo: oneOf(progress.chombo, ["none", "mangan"], "progress.chombo"),
      riichiBelow1000: bool(progress.riichiBelow1000, "progress.riichiBelow1000"),
    },
    final: {
      startPoints,
      returnPoints,
      uma: [uma[0], uma[1], uma[2], uma[3]] as [number, number, number, number],
      tieRule: oneOf(final.tieRule, ["seat", "split"], "final.tieRule"),
      leftoverKyotaku: oneOf(
        final.leftoverKyotaku,
        ["top", "void", "split"],
        "final.leftoverKyotaku",
      ),
    },
  };
}

export function defaultRules(): RoomRules {
  return validateRules(MLEAGUE_RULES);
}
