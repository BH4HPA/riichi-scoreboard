import { describe, expect, it } from "vitest";
import { MLEAGUE_RULES } from "../rules/mleague";
import type { RoomRules } from "../types/rules";
import { winPoints } from "./winPoints";

const R = MLEAGUE_RULES;
const withScoring = (patch: Partial<RoomRules["scoring"]>): RoomRules => ({
  ...R,
  scoring: { ...R.scoring, ...patch },
});
const ron = { tsumo: false, honba: 0 };
const tsumo = { tsumo: true, honba: 0 };

describe("winPoints", () => {
  it("平和自摸 20 符 2 番：子 400/700，亲 700 ALL", () => {
    const v = { han: 2, fu: 20, yakuman: 0 };
    expect(winPoints(v, { ...tsumo, dealer: false }, R)).toEqual({
      kind: "tsumo",
      label: "",
      honba: 0,
      total: 1500,
      fromNonDealer: 400,
      fromDealer: 700,
    });
    expect(winPoints(v, { ...tsumo, dealer: true }, R)).toMatchObject({
      total: 2100,
      fromNonDealer: 700,
      fromDealer: null,
    });
  });

  it("七对子 25 符 2 番荣和：子 1600、亲 2400", () => {
    const v = { han: 2, fu: 25, yakuman: 0 };
    expect(winPoints(v, { ...ron, dealer: false }, R)).toEqual({
      kind: "ron",
      label: "",
      honba: 0,
      total: 1600,
    });
    expect(winPoints(v, { ...ron, dealer: true }, R).total).toBe(2400);
  });

  it("切上满贯开关：4 番 30 符", () => {
    const v = { han: 4, fu: 30, yakuman: 0 };
    expect(winPoints(v, { ...ron, dealer: false }, R)).toMatchObject({
      label: "满贯",
      total: 8000,
    });
    expect(
      winPoints(v, { ...ron, dealer: false }, withScoring({ kiriageMangan: false })),
    ).toMatchObject({ label: "", total: 7700 });
  });

  it("役满叠加开关：两倍役满", () => {
    const v = { han: 0, fu: 0, yakuman: 2 };
    expect(winPoints(v, { ...ron, dealer: false }, R)).toMatchObject({
      label: "两倍役满",
      total: 64000,
    });
    expect(
      winPoints(v, { ...ron, dealer: false }, withScoring({ yakumanStacking: false })),
    ).toMatchObject({ label: "役满", total: 32000 });
  });

  it("本场：亲 2 本场自摸每家 +200，子荣和 +600", () => {
    const mangan = { han: 5, fu: 30, yakuman: 0 };
    expect(winPoints(mangan, { tsumo: true, honba: 2, dealer: true }, R)).toEqual({
      kind: "tsumo",
      label: "满贯",
      honba: 600,
      total: 12600,
      fromNonDealer: 4200,
      fromDealer: null,
    });
    expect(winPoints(mangan, { tsumo: false, honba: 2, dealer: false }, R)).toEqual({
      kind: "ron",
      label: "满贯",
      honba: 600,
      total: 8600,
    });
  });
});
