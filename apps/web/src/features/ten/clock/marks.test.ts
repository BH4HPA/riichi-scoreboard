import { describe, expect, it } from "vitest";
import { timeMarkText } from "./marks";

describe("暗计时的提示文案", () => {
  it("不写分钟数的倒计时", () => {
    expect(timeMarkText(1, "A")).toBe("剩余不到 10 分钟");
    expect(timeMarkText(2, "B")).toBe("剩余不到 5 分钟");
  });

  it("时间到：这一局还在打（Stage B）就让人打完；已经回到 Stage A 就只说请终局，不再邀人往下打", () => {
    expect(timeMarkText(3, "B")).toBe("时间到，打完这局请终局");
    expect(timeMarkText(3, "A")).toBe("时间到，请终局");
  });
});
