import type { RoomRules } from "../types/rules";

/** 一手牌的价值：番、符、役满倍数（0 表示非役满）。 */
export interface HandValue {
  han: number;
  fu: number;
  yakuman: number;
}

export type ScoreTier =
  "normal" | "mangan" | "haneman" | "baiman" | "sanbaiman" | "kazoeYakuman" | "yakuman";

export const TIER_LABELS: Record<ScoreTier, string> = {
  normal: "",
  mangan: "满贯",
  haneman: "跳满",
  baiman: "倍满",
  sanbaiman: "三倍满",
  kazoeYakuman: "累计役满",
  yakuman: "役满",
};

export function roundUpToHundred(value: number): number {
  return Math.ceil(value / 100) * 100;
}

function isKiriage(han: number, fu: number): boolean {
  return (han === 4 && fu === 30) || (han === 3 && fu === 60);
}

export function scoreTier(value: HandValue, rules: RoomRules): ScoreTier {
  const { han, fu, yakuman } = value;
  if (yakuman > 0) return "yakuman";
  if (han >= 13 && rules.scoring.kazoeYakuman) return "kazoeYakuman";
  if (han >= 11) return "sanbaiman";
  if (han >= 8) return "baiman";
  if (han >= 6) return "haneman";
  if (han === 5) return "mangan";
  if (rules.scoring.kiriageMangan && isKiriage(han, fu)) return "mangan";
  return fu * 2 ** (han + 2) >= 2000 ? "mangan" : "normal";
}

/** 规则下实际计分的役满倍数：不叠加时复合役满也只按一倍算（历史记录与文案同此口径）。 */
export function effectiveYakuman(value: HandValue, rules: RoomRules): number {
  return rules.scoring.yakumanStacking ? value.yakuman : Math.min(value.yakuman, 1);
}

/** 基本点：支付方按庄闲倍率与自摸分摊再取整（见 scoring/payments）。 */
export function calcBasePoints(value: HandValue, rules: RoomRules): number {
  const { han, fu } = value;
  const yakuman = effectiveYakuman(value, rules);
  if (yakuman > 0) return 8000 * yakuman;
  switch (scoreTier(value, rules)) {
    case "kazoeYakuman":
      return 8000;
    case "sanbaiman":
      return 6000;
    case "baiman":
      return 4000;
    case "haneman":
      return 3000;
    case "mangan":
      return 2000;
    default:
      return fu * 2 ** (han + 2);
  }
}

export function yakumanLabel(count: number): string {
  if (count <= 1) return "役满";
  const numerals = ["", "", "两倍", "三倍", "四倍", "五倍", "六倍"];
  return `${numerals[count] ?? `${count}倍`}役满`;
}
