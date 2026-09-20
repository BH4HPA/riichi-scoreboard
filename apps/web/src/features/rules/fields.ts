import type { RoomRules } from "@riichi/core";

export type FieldType =
  | { type: "switch" }
  | { type: "select"; options: Array<{ value: string; label: string }> }
  | { type: "number"; min: number; max: number; step?: number };

export interface RuleField {
  path: string;
  label: string;
  hint?: string;
  control: FieldType;
  /**
   * 只对四人房有意义：二人房（《天》规则）没有荣和、没有点棒往来、流局不罚符，这些开关在那里不生效，
   * 所以不显示——摆出来的每一项都应该真的改变计分。
   */
  yonmaOnly?: true;
  /** 二人房里换一种说法（同一个值，含义因房型而异） */
  tenHint?: string;
}

export type RuleGroupKey = "scoring" | "hand" | "win" | "progress" | "final";

export interface RuleGroup {
  /** 与 `RoomRules` 的分段同名：只消费部分规则的场合（二人房）据此筛选 */
  key: RuleGroupKey;
  title: string;
  fields: RuleField[];
}

export const RULE_GROUPS: RuleGroup[] = [
  {
    key: "scoring",
    title: "点数换算",
    fields: [
      {
        path: "scoring.kiriageMangan",
        label: "切上满贯",
        hint: "30符4番、60符3番视为满贯",
        control: { type: "switch" },
      },
      {
        path: "scoring.kazoeYakuman",
        label: "累计役满",
        hint: "关闭则 11 番以上封顶三倍满",
        control: { type: "switch" },
      },
      {
        path: "scoring.doubleYakuman",
        label: "多倍役满",
        hint: "大四喜、国士十三面等算两倍",
        control: { type: "switch" },
      },
      { path: "scoring.yakumanStacking", label: "复合役满叠加", control: { type: "switch" } },
      {
        path: "scoring.pao",
        label: "包牌",
        hint: "大三元/大四喜/四杠子责任払い",
        yonmaOnly: true,
        control: { type: "switch" },
      },
      {
        path: "scoring.honbaValue",
        label: "本场点数",
        hint: "300 的倍数，自摸时三家均摊",
        tenHint: "300 的倍数，每本场加给和牌得分",
        control: { type: "number", min: 0, max: 3000, step: 300 },
      },
      {
        path: "scoring.notenBappu",
        label: "不听罚符总额",
        yonmaOnly: true,
        control: { type: "number", min: 0, max: 6000, step: 1000 },
      },
    ],
  },
  {
    key: "hand",
    title: "役与宝牌",
    fields: [
      {
        path: "hand.akaCount",
        label: "赤宝牌",
        control: {
          type: "select",
          options: [
            { value: "0", label: "无" },
            { value: "3", label: "3 张" },
            { value: "4", label: "4 张" },
          ],
        },
      },
      { path: "hand.uraDora", label: "里宝", control: { type: "switch" } },
      { path: "hand.kanDora", label: "杠宝 / 杠里", control: { type: "switch" } },
      { path: "hand.kuitan", label: "食断", control: { type: "switch" } },
      { path: "hand.ippatsu", label: "一发", control: { type: "switch" } },
      {
        path: "hand.renhou",
        label: "人和",
        yonmaOnly: true,
        control: {
          type: "select",
          options: [
            { value: "none", label: "无" },
            { value: "yakuman", label: "役满" },
          ],
        },
      },
      {
        path: "hand.nagashiMangan",
        label: "流局满贯",
        control: { type: "switch" },
        yonmaOnly: true,
      },
      {
        path: "hand.kokushiAnkanChankan",
        label: "国士抢暗杠",
        control: { type: "switch" },
        yonmaOnly: true,
      },
    ],
  },
  {
    key: "win",
    title: "和了裁定",
    fields: [
      {
        path: "win.multiRon",
        label: "多家荣和",
        control: {
          type: "select",
          options: [
            { value: "atamahane", label: "头跳" },
            { value: "double", label: "允许双响" },
            { value: "triple", label: "允许三响" },
          ],
        },
      },
    ],
  },
  {
    key: "progress",
    title: "进行",
    fields: [
      {
        path: "progress.length",
        label: "局数",
        control: {
          type: "select",
          options: [
            { value: "east", label: "东风战" },
            { value: "hanchan", label: "半庄" },
          ],
        },
      },
      { path: "progress.tobi.enabled", label: "击飞", control: { type: "switch" } },
      {
        path: "progress.tobi.threshold",
        label: "击飞阈值",
        control: {
          type: "select",
          options: [
            { value: "below0", label: "负分才击飞" },
            { value: "at0", label: "0 分也击飞" },
          ],
        },
      },
      {
        path: "progress.tobi.bonus",
        label: "击飞奖励（千点）",
        control: { type: "number", min: 0, max: 50 },
      },
      { path: "progress.enchousen.enabled", label: "西入 / 延长战", control: { type: "switch" } },
      {
        path: "progress.enchousen.threshold",
        label: "延长战目标点",
        control: { type: "number", min: 0, max: 100000, step: 1000 },
      },
      { path: "progress.agariYame", label: "和了止", control: { type: "switch" } },
      { path: "progress.tenpaiYame", label: "听牌止", control: { type: "switch" } },
      {
        path: "progress.abortiveDraws",
        label: "途中流局",
        hint: "九种九牌 / 四风连打 / 四家立直 / 四杠散了",
        control: { type: "switch" },
      },
      {
        path: "progress.chombo",
        label: "错和罚符",
        control: {
          type: "select",
          options: [
            { value: "none", label: "无" },
            { value: "mangan", label: "满贯罚符" },
          ],
        },
      },
      {
        path: "progress.riichiBelow1000",
        label: "不足 1000 点可立直",
        control: { type: "switch" },
      },
    ],
  },
  {
    key: "final",
    title: "终局",
    fields: [
      {
        path: "final.startPoints",
        label: "起始点",
        control: { type: "number", min: 0, max: 100000, step: 1000 },
      },
      {
        path: "final.returnPoints",
        label: "返点",
        control: { type: "number", min: 0, max: 100000, step: 1000 },
      },
      { path: "final.uma.0", label: "一位马", control: { type: "number", min: -100, max: 100 } },
      { path: "final.uma.1", label: "二位马", control: { type: "number", min: -100, max: 100 } },
      { path: "final.uma.2", label: "三位马", control: { type: "number", min: -100, max: 100 } },
      { path: "final.uma.3", label: "四位马", control: { type: "number", min: -100, max: 100 } },
      {
        path: "final.tieRule",
        label: "同点处理",
        control: {
          type: "select",
          options: [
            { value: "split", label: "顺位点按分" },
            { value: "seat", label: "起家优先" },
          ],
        },
      },
      {
        path: "final.leftoverKyotaku",
        label: "终局残留场供",
        control: {
          type: "select",
          options: [
            { value: "top", label: "一位取得" },
            { value: "void", label: "消失" },
            { value: "split", label: "四家平分" },
          ],
        },
      },
    ],
  },
];

export function getPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], obj);
}

export function setPath(rules: RoomRules, path: string, value: unknown): RoomRules {
  const keys = path.split(".");
  const clone = JSON.parse(JSON.stringify(rules)) as RoomRules;
  let cursor = clone as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  cursor[keys[keys.length - 1]!] = value;
  return clone;
}

/** 二人房消费的分组：得分 = 四麻自摸的总收入，所以只有「点数换算」与「役与宝牌」；组内再去掉 `yonmaOnly` 的字段 */
const TEN_GROUPS: readonly RuleGroupKey[] = ["scoring", "hand"];

/** 某种房型下要显示的规则分组与字段（说明文字已按房型取好）。`kind` 缺省 = 四人房，全部显示。 */
export function ruleGroupsFor(kind: "yonma" | "ten" | undefined): RuleGroup[] {
  if (kind !== "ten") return RULE_GROUPS;
  return RULE_GROUPS.filter((g) => TEN_GROUPS.includes(g.key)).map((g) => ({
    ...g,
    fields: g.fields
      .filter((f) => !f.yonmaOnly)
      .map((f) => (f.tenHint ? { ...f, hint: f.tenHint } : f)),
  }));
}
