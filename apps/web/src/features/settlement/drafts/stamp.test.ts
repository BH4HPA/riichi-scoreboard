import { describe, expect, it } from "vitest";
import { createTenGame, type TenGameState, type TenStage } from "@riichi/core";
import { tenDraftStamp } from "./stamp";

const players = [
  { id: "a", name: "阿东", avatar: null },
  { id: "b", name: "阿西", avatar: null },
];
const game = (stage: TenStage): TenGameState => ({ ...createTenGame(players, 0), stage });
const stageB = (attacker: 0 | 1, riichi: boolean, marked: number[] = []): TenStage => ({
  kind: "B",
  attacker,
  riichi,
  marked,
});

describe("二人房的草稿局面戳", () => {
  it("防守方在全牌型板上划牌不改变它：进攻方录手牌时弹窗不会被一下下关掉", () => {
    expect(tenDraftStamp(1, game(stageB(0, true)))).toBe(
      tenDraftStamp(1, game(stageB(0, true, [1, 9, 31]))),
    );
  });

  it("同一局里撤销后重新宣言——换了人，或立直改成听牌宣言——是另一次宣言，旧草稿不能沿用", () => {
    const riichi = tenDraftStamp(1, game(stageB(0, true)));
    expect(tenDraftStamp(1, game(stageB(0, false)))).not.toBe(riichi);
    expect(tenDraftStamp(1, game(stageB(1, true)))).not.toBe(riichi);
    expect(tenDraftStamp(1, game({ kind: "A" }))).not.toBe(riichi);
  });

  it("记了一局、终局、重开一局都会改变它", () => {
    const base = game({ kind: "A" });
    const stamp = tenDraftStamp(1, base);
    expect(tenDraftStamp(1, { ...base, status: "finished" })).not.toBe(stamp);
    expect(tenDraftStamp(2, base)).not.toBe(stamp);
    const entry = {
      kind: "tenDraw" as const,
      reason: "noDeclare" as const,
      attacker: null,
      riichi: false,
      seq: 9,
      at: 0,
      round: 1,
      honba: 0,
      dealer: 0 as const,
      names: ["阿东", "阿西"],
    };
    expect(tenDraftStamp(1, { ...base, history: [entry] })).not.toBe(stamp);
  });
});
