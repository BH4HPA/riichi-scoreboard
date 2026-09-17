import { MLEAGUE_RULES, validateRules, type RoomRules } from "@riichi/core";

/** 本机记住算点数页的规则：跨次访问基本不变；场风、自风、本场每手都变，不记。 */
const KEY = "riichi.calc.rules";

export function readCalcRules(): RoomRules {
  try {
    const raw = localStorage.getItem(KEY);
    // 规则字段随版本增减：旧值校验不过就回默认，不让页面打不开
    return raw ? validateRules(JSON.parse(raw)) : MLEAGUE_RULES;
  } catch {
    return MLEAGUE_RULES;
  }
}

export function writeCalcRules(rules: RoomRules): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rules));
  } catch {
    /* 私密模式等场景忽略 */
  }
}
