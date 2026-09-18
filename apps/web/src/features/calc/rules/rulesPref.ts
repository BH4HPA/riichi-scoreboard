import { MLEAGUE_RULES, validateRules, type RoomRules } from "@riichi/core";
import { readLocalJson, writeLocal } from "@/lib/localStore";

/** 本机记住算点数页的规则：跨次访问基本不变；场风、自风、本场每手都变，不记。 */
const KEY = "riichi.calc.rules";

/** 规则字段随版本增减：旧值校验不过就回默认，不让页面打不开。 */
export const readCalcRules = (): RoomRules => readLocalJson(KEY, validateRules) ?? MLEAGUE_RULES;

export const writeCalcRules = (rules: RoomRules) => writeLocal(KEY, JSON.stringify(rules));
