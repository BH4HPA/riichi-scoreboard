import { describe, expect, it } from "vitest";
import { missingText, ronSummary, tsumoSummary } from "./footerSummary";

const names = ["东家", "南家", "西家", "北家"];

describe("结算底栏摘要", () => {
  it("自摸写和牌者净收入，包牌追加说明", () => {
    expect(tsumoSummary(names, 3, [-2000, -2000, -4000, 8000], null)).toBe(
      "北家 自摸 · 收入 +8,000",
    );
    expect(tsumoSummary(names, 3, [-32000, 0, 0, 32000], 0)).toBe(
      "北家 自摸 · 收入 +32,000（东家包牌）",
    );
  });
  it("荣和单响写和牌者净收入（放铳者立直棒不混进来）", () => {
    // 8000 点荣和、放铳者本局立直：放铳者 -9000，和牌者 +9000（含立直棒）
    expect(ronSummary(names, 0, [{ winner: 3, pao: null }], [-9000, 0, 0, 9000])).toBe(
      "北家 荣和 东家 · 收入 +9,000",
    );
  });
  it("多响逐个列出", () => {
    expect(
      ronSummary(
        names,
        0,
        [
          { winner: 3, pao: null },
          { winner: 2, pao: null },
        ],
        [-10300, 0, 2000, 8300],
      ),
    ).toBe("北家 +8,300、西家 +2,000 荣和 东家");
  });
  it("缺项去重", () => {
    expect(missingText(["放铳者", "番", "符", "番"])).toBe("还需选择：放铳者、番、符");
  });
});
