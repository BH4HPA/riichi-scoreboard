import { describe, expect, it } from "vitest";
import { nextTenMarkAt, tenTimeMark } from "./clock";

const MIN = 60_000;
const START = 1_000_000;

describe("暗计时", () => {
  it("剩 10 分、剩 5 分、时间到各进一档", () => {
    expect(tenTimeMark(START, START)).toBe(0);
    expect(tenTimeMark(START, START + 50 * MIN - 1)).toBe(0);
    expect(tenTimeMark(START, START + 50 * MIN)).toBe(1);
    expect(tenTimeMark(START, START + 55 * MIN)).toBe(2);
    expect(tenTimeMark(START, START + 60 * MIN)).toBe(3);
    expect(tenTimeMark(START, START + 600 * MIN)).toBe(3);
  });

  it("下一档的触发时刻；三档都过了为 null", () => {
    expect(nextTenMarkAt(START, START)).toBe(START + 50 * MIN);
    expect(nextTenMarkAt(START, START + 50 * MIN)).toBe(START + 55 * MIN);
    expect(nextTenMarkAt(START, START + 57 * MIN)).toBe(START + 60 * MIN);
    expect(nextTenMarkAt(START, START + 60 * MIN)).toBeNull();
  });
});
