import { describe, expect, it } from "vitest";
import { pointsText } from "./pointsText";

describe("pointsText", () => {
  it("荣和：总数 + 本场", () => {
    expect(pointsText({ kind: "ron", label: "满贯", honba: 600, total: 8600 })).toEqual({
      main: "8600 点",
      detail: "放铳者支付，含本场 600",
    });
  });
  it("闲家自摸：闲 / 庄", () => {
    expect(
      pointsText({
        kind: "tsumo",
        label: "",
        honba: 0,
        total: 1500,
        fromNonDealer: 400,
        fromDealer: 700,
      }),
    ).toEqual({ main: "400 / 700 点", detail: "闲家 / 庄家各付，合计 1500 点" });
  });
  it("庄家自摸：ALL", () => {
    expect(
      pointsText({
        kind: "tsumo",
        label: "满贯",
        honba: 600,
        total: 12600,
        fromNonDealer: 4200,
        fromDealer: null,
      }),
    ).toEqual({ main: "4200 点 ALL", detail: "三家各付，合计 12600 点，含本场 600" });
  });
});
