import { describe, expect, it } from "vitest";
import { relativeSeatLabel } from "./format";

describe("relativeSeatLabel", () => {
  it("东南西北逆时针：+1 下家、+2 对家、+3 上家", () => {
    expect([0, 1, 2, 3].map((s) => relativeSeatLabel(1, s as 0 | 1 | 2 | 3))).toEqual([
      "上家",
      "自己",
      "下家",
      "对家",
    ]);
    expect(relativeSeatLabel(3, 0)).toBe("下家");
    expect(relativeSeatLabel(0, 3)).toBe("上家");
  });

  it("不在座时不标注", () => {
    expect(relativeSeatLabel(null, 2)).toBeNull();
  });
});
