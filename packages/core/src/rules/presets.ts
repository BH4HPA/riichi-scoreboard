import type { RoomRules, RulesPreset } from "../types/rules";
import { MLEAGUE_RULES } from "./mleague";

/**
 * 内置预设。数值 2026-09-15 核实（来源：tenhou.net/man、saikouisen.com 競技規定 2024-12、
 * WRC Rules 2025、game8/nya wiki 的雀魂条目）。只收录现有 RoomRules 能完整表达的规则集；
 * 表达不了的差异写在 note 里，不伪装成官方值。
 */

/** 各分区可部分覆盖；uma 等元组整体替换。 */
interface RulesPatch {
  scoring?: Partial<RoomRules["scoring"]>;
  hand?: Partial<RoomRules["hand"]>;
  win?: Partial<RoomRules["win"]>;
  progress?: Partial<Omit<RoomRules["progress"], "tobi" | "enchousen">> & {
    tobi?: Partial<RoomRules["progress"]["tobi"]>;
    enchousen?: Partial<RoomRules["progress"]["enchousen"]>;
  };
  final?: Partial<RoomRules["final"]>;
}

function withRules(base: RoomRules, patch: RulesPatch): RoomRules {
  return {
    scoring: { ...base.scoring, ...patch.scoring },
    hand: { ...base.hand, ...patch.hand },
    win: { ...base.win, ...patch.win },
    progress: {
      ...base.progress,
      ...patch.progress,
      tobi: { ...base.progress.tobi, ...patch.progress?.tobi },
      enchousen: { ...base.progress.enchousen, ...patch.progress?.enchousen },
    },
    final: { ...base.final, ...patch.final },
  };
}

/** 雀魂 段位场·四人南（各「之间」对局内规则相同，段位 pt 属于赛季积分，不在此处）。 */
export const MAJSOUL_RANKED_RULES: RoomRules = withRules(MLEAGUE_RULES, {
  scoring: { kiriageMangan: false, kazoeYakuman: true, doubleYakuman: true },
  hand: { nagashiMangan: true },
  win: { multiRon: "triple" },
  progress: {
    tobi: { enabled: true, threshold: "below0", bonus: 0 },
    enchousen: { enabled: true, threshold: 30000 },
    agariYame: true,
    tenpaiYame: true,
    abortiveDraws: true,
    riichiBelow1000: false,
  },
  final: { startPoints: 25000, returnPoints: 25000, uma: [15, 5, -5, -15], tieRule: "seat" },
});

/** 天凤 凤凰卓·四人南（赤あり、喰断あり）。 */
export const TENHOU_HOUOU_RULES: RoomRules = withRules(MLEAGUE_RULES, {
  scoring: { kiriageMangan: false, kazoeYakuman: true },
  hand: { nagashiMangan: true },
  win: { multiRon: "double" },
  progress: {
    tobi: { enabled: true, threshold: "below0", bonus: 0 },
    enchousen: { enabled: true, threshold: 30000 },
    agariYame: true,
    tenpaiYame: true,
    abortiveDraws: true,
    riichiBelow1000: false,
  },
  final: { startPoints: 25000, returnPoints: 30000, uma: [20, 10, -10, -20], tieRule: "seat" },
});

/** 最高位战 通常规则（2024-12 競技規定）。 */
export const SAIKOUISEN_RULES: RoomRules = withRules(MLEAGUE_RULES, {
  scoring: { kiriageMangan: true, kazoeYakuman: false, pao: false },
  hand: { akaCount: 0 },
  final: {
    startPoints: 30000,
    returnPoints: 30000,
    uma: [30, 10, -10, -30],
    tieRule: "split",
    leftoverKyotaku: "void",
  },
});

/** WRC 2025（World Riichi Championship）。 */
export const WRC_RULES: RoomRules = withRules(MLEAGUE_RULES, {
  scoring: { kiriageMangan: true, kazoeYakuman: true },
  hand: { akaCount: 0 },
  final: {
    startPoints: 30000,
    returnPoints: 30000,
    uma: [15, 5, -5, -15],
    tieRule: "split",
    leftoverKyotaku: "void",
  },
});

export const BUILTIN_PRESETS: readonly RulesPreset[] = [
  { id: "mleague", name: "M-League", rules: MLEAGUE_RULES },
  {
    id: "majsoul-ranked",
    name: "雀魂 段位场·四人南",
    rules: MAJSOUL_RANKED_RULES,
    note: "25000 起 25000 返、马 15/5、三响、击飞、西入；段位 pt 属赛季积分，不含在内。",
  },
  {
    id: "tenhou-houou",
    name: "天凤 凤凰卓·四人南",
    rules: TENHOU_HOUOU_RULES,
    note: "赤あり喰断あり；oka 20 归一位；双响、击飞、猝死西入。",
  },
  {
    id: "saikouisen",
    name: "最高位战 通常规则",
    rules: SAIKOUISEN_RULES,
    note: "无赤、无包牌、11 番以上三倍满；错和 -20P 无法表达，按无罚符。",
  },
  {
    id: "wrc",
    name: "WRC 2025",
    rules: WRC_RULES,
    note: "无赤、切上满贯；13 番按累计役满（32000）近似四倍满；人和满贯无此档，按无。",
  },
];
