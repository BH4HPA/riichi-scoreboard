import { describe, expect, it } from "vitest";
import { validateHandInput } from "../hand/options";
import { MLEAGUE_RULES } from "../rules/mleague";
import { AKA, TILE } from "../types/tiles";
import { parseTiles } from "./notation";
import { buildPointsTable, cellValidity, limitCards, pointsFromBase } from "./pointsTable";
import { YAKU_PAGES } from "./yakuTable";
import { validateUiIntent } from "../protocol";

const R = MLEAGUE_RULES;

describe("parseTiles", () => {
  it("解析 MPSZ 记法，0 为赤五，z 为字牌", () => {
    expect(parseTiles("123m406p7z")).toEqual([1, 2, 3, 13, AKA.P5, 15, TILE.Chun]);
    expect(parseTiles("19m19p19s1234567z")).toHaveLength(13);
    expect(() => parseTiles("12")).toThrow(/花色/);
    expect(() => parseTiles("8z")).toThrow(/字牌/);
  });
});

describe("役种示例牌", () => {
  const all = YAKU_PAGES.flatMap((p) => p.items);
  it.each(all.filter((y) => y.example).map((y) => [y.name, y] as const))(
    "%s 示例为合法 14 张牌面",
    (_name, info) => {
      const ex = info.example!;
      const hand = {
        closed: ex.closed,
        melds: ex.melds,
        winTile: ex.winTile ?? ex.closed[ex.closed.length - 1]!,
        tsumo: true,
        doraIndicators: ex.doraIndicators,
        uraIndicators: [],
        riichi: false,
        doubleRiichi: false,
        ippatsu: false,
        afterKan: false,
        lastTile: false,
        firstTake: false,
      };
      expect(() => validateHandInput(hand, R)).not.toThrow();
      expect(ex.closed.length + ex.melds.length * 3).toBe(14);
    },
  );
  it("只有流局满贯没有示例牌", () => {
    expect(all.filter((y) => !y.example).map((y) => y.name)).toEqual(["流局满贯"]);
  });
  it("役 id 不重复", () => {
    const ids = all.map((y) => y.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("点数表布局", () => {
  it("闲家 30 符：1～3 番普通格，4 番起切上满贯并与 40/50 符合并为块", () => {
    const rows = buildPointsTable(R, "ko");
    const r30 = rows.find((r) => r.fu === 30)!;
    expect(r30.cells.map((c) => c.cell.ron)).toEqual([1000, 2000, 3900]);
    expect(r30.cells[0]!.cell.tsumo).toEqual({ ko: 300, oya: 500 });
    expect(r30.manganFrom).toBe(4);
    expect(r30.manganBlock).toEqual({ rowSpan: 3 });
    expect(rows.find((r) => r.fu === 40)!.manganBlock).toBeNull();
    expect(rows.find((r) => r.fu === 60)!.manganFrom).toBe(3);
    expect(rows.find((r) => r.fu === 60)!.manganBlock).toEqual({ rowSpan: 6 });
  });

  it("关闭切上满贯时 30 符 4 番为 7700，60 符 3 番为 7700", () => {
    const noKiriage = { ...R, scoring: { ...R.scoring, kiriageMangan: false } };
    const rows = buildPointsTable(noKiriage, "ko");
    expect(rows.find((r) => r.fu === 30)!.cells.map((c) => c.cell.ron)).toEqual([
      1000, 2000, 3900, 7700,
    ]);
    expect(rows.find((r) => r.fu === 30)!.manganFrom).toBeNull();
    expect(rows.find((r) => r.fu === 60)!.cells[2]!.cell.ron).toBe(7700);
    expect(rows.find((r) => r.fu === 70)!.manganFrom).toBe(3);
  });

  it("20 符无荣和且 1 番不存在；25 符 2 番不可自摸；庄家格为 ×6 / 每家 ×2", () => {
    expect(cellValidity(20, 1)).toEqual({ ron: false, tsumo: false });
    expect(cellValidity(25, 2)).toEqual({ ron: true, tsumo: false });
    const rows = buildPointsTable(R, "oya");
    const r20 = rows.find((r) => r.fu === 20)!;
    expect(r20.cells[1]!.cell).toEqual({ ron: null, tsumo: { ko: 700, oya: 700 } });
    expect(pointsFromBase(2000, "oya")).toEqual({ ron: 12000, tsumo: { ko: 4000, oya: 4000 } });
  });

  it("满贯以上卡片按规则：M-League 13 番为三倍满", () => {
    const cards = limitCards(R, "ko");
    expect(cards.map((c) => c.label)).toEqual(["满贯", "跳满", "倍满", "三倍满", "三倍满"]);
    expect(cards[0]!.cell).toEqual({ ron: 8000, tsumo: { ko: 2000, oya: 4000 } });
    const kazoe = { ...R, scoring: { ...R.scoring, kazoeYakuman: true } };
    expect(limitCards(kazoe, "ko")[4]!.label).toBe("累计役满");
  });
});

describe("validateUiIntent：结算镜像", () => {
  const hand = {
    closed: [1, 2, 3, 13, 36, 15, 25, 26, 27, 7, 8, 9, 11, 11],
    melds: [],
    winTile: 9,
    tsumo: false,
    doraIndicators: [],
    uraIndicators: [],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    afterKan: false,
    lastTile: false,
    firstTake: false,
  };
  const evaluated = { han: 2, fu: 30, yakuman: 0, yaku: { "33": 1, "55": 1 }, isAgari: true };
  const base = { kind: "settlement", mode: "ron", deltas: [0, 2000, 0, -2000], summary: "x" };

  it("接受带牌面与评估结果的和牌者，裁剪过长文案", () => {
    const out = validateUiIntent({
      ...base,
      loser: 3,
      riichi: [1],
      wins: [{ winner: 1, valueText: "a".repeat(300), hand, evaluated }],
    });
    expect(out.kind).toBe("settlement");
    if (out.kind !== "settlement") return;
    expect(out.wins[0]!.hand).toEqual(hand);
    expect(out.wins[0]!.evaluated).toEqual(evaluated);
    expect(out.wins[0]!.valueText).toHaveLength(200);
    expect(out.loser).toBe(3);
  });

  it.each([
    [
      {
        ...base,
        loser: null,
        riichi: [],
        wins: [{ winner: 9, valueText: null, hand: null, evaluated: null }],
      },
    ],
    [{ ...base, loser: null, riichi: [0, 0, 0, 0, 0], wins: [] }],
    [
      {
        ...base,
        loser: null,
        riichi: [],
        wins: [{ winner: 0, valueText: null, hand: { ...hand, winTile: 0 }, evaluated: null }],
      },
    ],
    [
      {
        ...base,
        loser: null,
        riichi: [],
        wins: [
          { winner: 0, valueText: null, hand: null, evaluated: { ...evaluated, yaku: { a: 1.5 } } },
        ],
      },
    ],
    [{ ...base, loser: null, riichi: [], wins: [1, 2, 3, 4] }],
    [{ ...base, loser: null, riichi: [] }],
  ])("拒绝畸形结算意图 %#", (input) => {
    expect(() => validateUiIntent(input)).toThrow(/镜像意图|无效/);
  });
});
