import { describe, expect, it } from "vitest";
import { MLEAGUE_RULES, TILE, YAKU_ID, type HandInput } from "@riichi/core";
import { evaluateHand } from "./evaluate";

function hand(partial: Partial<HandInput> = {}): HandInput {
  return {
    // 123m 456p 789s 789m 22p：平和形，两面听 9m（7-8m 听 6m/9m）
    closed: [
      TILE.M1,
      TILE.M2,
      TILE.M3,
      TILE.P4,
      TILE.P5,
      TILE.P6,
      TILE.S7,
      TILE.S8,
      TILE.S9,
      TILE.M7,
      TILE.M8,
      TILE.M9,
      TILE.P2,
      TILE.P2,
    ],
    melds: [],
    winTile: TILE.M9,
    tsumo: false,
    doraIndicators: [TILE.S1],
    uraIndicators: [],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    afterKan: false,
    lastTile: false,
    firstTake: false,
    ...partial,
  };
}

describe("evaluateHand (riichi-rs-node)", () => {
  it("门清荣和平和：1 番 30 符", () => {
    const r = evaluateHand(hand(), { seat: 1, dealer: 0, roundWind: 0 }, MLEAGUE_RULES);
    expect(r.isAgari).toBe(true);
    expect(r.han).toBe(1);
    expect(r.fu).toBe(30);
    expect(r.yaku[String(YAKU_ID.Pinfu)]).toBe(1);
  });

  it("立直自摸平和 + 里宝", () => {
    const r = evaluateHand(
      hand({ tsumo: true, riichi: true, uraIndicators: [TILE.P1] }), // 里宝 2p ×2
      { seat: 1, dealer: 0, roundWind: 0 },
      MLEAGUE_RULES,
    );
    expect(r.han).toBe(1 + 1 + 1 + 2); // 立直 + 自摸 + 平和 + 里宝2
    expect(r.fu).toBe(20);
    // 引擎只接收合并后的宝牌列表，里宝并入"宝牌"计数
    expect(r.yaku[String(YAKU_ID.Dora)]).toBe(2);
  });

  it("无役牌型不是和牌", () => {
    // 碰 2s 后 123m 456p 789m 22p 荣和 9m：含幺九无断幺、无役牌、副露无平和 → 无役
    const r = evaluateHand(
      hand({
        closed: [
          TILE.M1,
          TILE.M2,
          TILE.M3,
          TILE.P4,
          TILE.P5,
          TILE.P6,
          TILE.M7,
          TILE.M8,
          TILE.M9,
          TILE.P2,
          TILE.P2,
        ],
        melds: [{ open: true, tiles: [TILE.S2, TILE.S2, TILE.S2] }],
        winTile: TILE.M9,
      }),
      { seat: 1, dealer: 0, roundWind: 0 },
      MLEAGUE_RULES,
    );
    expect(r.isAgari).toBe(false);
  });

  it("连风雀头：东场东家 双东雀头 门清立直荣和 两面听", () => {
    const r = evaluateHand(
      hand({
        closed: [
          TILE.M1,
          TILE.M2,
          TILE.M3,
          TILE.P4,
          TILE.P5,
          TILE.P6,
          TILE.S7,
          TILE.S8,
          TILE.S9,
          TILE.S2,
          TILE.S3,
          TILE.East,
          TILE.East,
          TILE.S4,
        ],
        winTile: TILE.S4,
        riichi: true,
        doraIndicators: [],
      }),
      { seat: 0, dealer: 0, roundWind: 0 },
      MLEAGUE_RULES,
    );
    expect(r.isAgari).toBe(true);
    // 副底 20 + 门清荣和 10 + 连风雀头 4 → 34 → 切上 40 符（引擎按 4 符计连风雀头）
    expect(r.fu).toBe(40);
  });

  it("无役牌型返回原因 noYaku", () => {
    const r = evaluateHand(
      hand({
        closed: [
          TILE.M1,
          TILE.M2,
          TILE.M3,
          TILE.P4,
          TILE.P5,
          TILE.P6,
          TILE.M7,
          TILE.M8,
          TILE.M9,
          TILE.P2,
          TILE.P2,
        ],
        melds: [{ open: true, tiles: [TILE.S2, TILE.S2, TILE.S2] }],
        winTile: TILE.M9,
      }),
      { seat: 1, dealer: 0, roundWind: 0 },
      MLEAGUE_RULES,
    );
    expect(r).toMatchObject({ isAgari: false, reason: "noYaku" });
  });

  it("役满：大三元，复合役满按规则叠加", () => {
    const daisangen = hand({
      closed: [
        TILE.Haku,
        TILE.Haku,
        TILE.Haku,
        TILE.Hatsu,
        TILE.Hatsu,
        TILE.Hatsu,
        TILE.Chun,
        TILE.Chun,
        TILE.Chun,
        TILE.M2,
        TILE.M3,
        TILE.M4,
        TILE.P9,
        TILE.P9,
      ],
      winTile: TILE.M4,
      doraIndicators: [],
    });
    const r = evaluateHand(daisangen, { seat: 2, dealer: 0, roundWind: 0 }, MLEAGUE_RULES);
    expect(r.yakuman).toBe(1);
    expect(r.yaku[String(YAKU_ID.Daisangen)]).toBeDefined();
  });
});
