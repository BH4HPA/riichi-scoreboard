import { describe, expect, it } from "vitest";
import { wideConsoleMinWidth, wideConsoleQuery } from "./wideQuery";

describe("wideConsoleQuery", () => {
  it("100% 档保持原来的 1280 门槛", () => {
    expect(wideConsoleQuery(1)).toBe("(min-width: 1280px)");
  });
  it("放大后按两栏最小宽度推出门槛：1366 宽在 115% 仍是双栏，130% 改单栏", () => {
    expect(wideConsoleMinWidth(1.15)).toBe(1360);
    expect(wideConsoleMinWidth(1.15)).toBeLessThanOrEqual(1366);
    expect(wideConsoleMinWidth(1.3)).toBe(1535);
  });
  it("1180 宽的 iPad 横屏在任何档位都走单栏", () => {
    for (const s of [1, 1.15, 1.3]) expect(wideConsoleMinWidth(s)).toBeGreaterThan(1180);
  });
});
