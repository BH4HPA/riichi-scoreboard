import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MLEAGUE_RULES,
  TILE,
  YAKU_ID,
  type EvaluatedHand,
  type EvaluateRequest,
  type HandInput,
} from "@riichi/core";
import { createApp } from "../../app";
import { loadConfig } from "../../config";

// 123m 456p 789s 南南南 22p，荣和 3m：唯一的役只可能是南（场风或自风）
const HAND: HandInput = {
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
    TILE.South,
    TILE.South,
    TILE.South,
    TILE.P2,
    TILE.P2,
  ],
  melds: [],
  winTile: TILE.M3,
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
const REQ: EvaluateRequest = { hand: HAND, rules: MLEAGUE_RULES, roundWind: 0, seatWind: 0 };

let dataDir: string;
let ctx: ReturnType<typeof createApp>;
let token = "";

async function evaluate(body: unknown, tok = token): Promise<Response> {
  return ctx.app.request("/api/evaluate", {
    method: "POST",
    headers: {
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "riichi-eval-"));
  const config = { ...loadConfig({}), dataDir, corsOrigins: [], webDist: "/nonexistent" };
  ctx = createApp({ config, dbFile: ":memory:", quiet: true });
  const res = await ctx.app.request("/api/me/register", { method: "POST", body: "{}" });
  token = ((await res.json()) as { token: string }).token;
});

afterAll(() => {
  ctx.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("POST /api/evaluate", () => {
  it("无 token → 401", async () => {
    expect((await evaluate(REQ, "")).status).toBe(401);
  });

  it("东场东家：南刻子无役 → isAgari=false", async () => {
    const res = await evaluate(REQ);
    expect(res.status).toBe(200);
    expect(((await res.json()) as EvaluatedHand).isAgari).toBe(false);
  });

  it("场风、自风分别带来役牌", async () => {
    const round = (await (await evaluate({ ...REQ, roundWind: 1 })).json()) as EvaluatedHand;
    expect(round.yaku[YAKU_ID.RoundWindSouth]).toBe(1);
    expect(round.yaku[YAKU_ID.OwnWindSouth]).toBeUndefined();
    const own = (await (await evaluate({ ...REQ, seatWind: 1 })).json()) as EvaluatedHand;
    expect(own.yaku[YAKU_ID.OwnWindSouth]).toBe(1);
    expect(own.han).toBe(1);
  });

  it("坏请求与违反规则约束 → 400 带原因", async () => {
    expect((await evaluate({ ...REQ, seatWind: 7 })).status).toBe(400);
    expect((await evaluate({ ...REQ, rules: { ...MLEAGUE_RULES, hand: 1 } })).status).toBe(400);
    const noUra = { ...MLEAGUE_RULES, hand: { ...MLEAGUE_RULES.hand, uraDora: false } };
    const res = await evaluate({
      ...REQ,
      rules: noUra,
      hand: { ...HAND, riichi: true, doraIndicators: [TILE.M1], uraIndicators: [TILE.M2] },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toBeTruthy();
  });
});
