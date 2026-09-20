import { describe, expect, it } from "vitest";
import { RULE_GROUPS, ruleGroupsFor } from "./fields";

describe("按房型显示的规则字段", () => {
  it("四人房（以及不认房型的旧视图）：全部分组与字段", () => {
    expect(ruleGroupsFor("yonma")).toBe(RULE_GROUPS);
    expect(ruleGroupsFor(undefined)).toBe(RULE_GROUPS);
  });

  it("二人房：只有点数换算与役、宝牌两节，且去掉在那里不生效的开关", () => {
    const groups = ruleGroupsFor("ten");
    expect(groups.map((g) => g.key)).toEqual(["scoring", "hand"]);
    const paths = groups.flatMap((g) => g.fields.map((f) => f.path));
    // 没有荣和、没有点棒往来、流局不罚符
    for (const gone of [
      "scoring.pao",
      "scoring.notenBappu",
      "hand.nagashiMangan",
      "hand.kokushiAnkanChankan",
      "hand.renhou",
    ]) {
      expect(paths).not.toContain(gone);
    }
    // 真正影响得分的都在
    for (const kept of [
      "scoring.kiriageMangan",
      "scoring.honbaValue",
      "hand.akaCount",
      "hand.uraDora",
      "hand.ippatsu",
      "hand.kuitan",
    ]) {
      expect(paths).toContain(kept);
    }
  });

  it("二人房里「本场点数」的说明不再说三家均摊", () => {
    const honba = ruleGroupsFor("ten")
      .flatMap((g) => g.fields)
      .find((f) => f.path === "scoring.honbaValue")!;
    expect(honba.hint).toBe("300 的倍数，每本场加给和牌得分");
  });
});
