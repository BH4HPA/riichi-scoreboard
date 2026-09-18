import { describe, expect, it } from "vitest";
import { isTrackId, parseMusicCatalog } from "./index";

const A = "43ace007-662f-42eb-bab5-cf1c26fc7598";
const B = "07f0350b-f0ca-428d-9b5f-a86493555471";

describe("music catalog", () => {
  it("id 只认小写 uuid v4", () => {
    expect(isTrackId(A)).toBe(true);
    expect(isTrackId(A.toUpperCase())).toBe(false);
    expect(isTrackId("nope")).toBe(false);
    expect(isTrackId(null)).toBe(false);
  });

  it("解析清单：修剪标题；形状不对、id 重复整份拒绝", () => {
    expect(parseMusicCatalog([{ id: A, title: " 一曲 " }])).toEqual([{ id: A, title: "一曲" }]);
    expect(parseMusicCatalog([])).toEqual([]);
    expect(() => parseMusicCatalog({})).toThrow();
    expect(() => parseMusicCatalog([{ id: "x", title: "t" }])).toThrow();
    expect(() => parseMusicCatalog([{ id: A, title: "" }])).toThrow();
    expect(() =>
      parseMusicCatalog([
        { id: A, title: "a" },
        { id: A, title: "b" },
      ]),
    ).toThrow();
    expect(
      parseMusicCatalog([
        { id: A, title: "a" },
        { id: B, title: "b" },
      ]),
    ).toHaveLength(2);
  });
});
