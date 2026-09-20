import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RecognitionSessionSummary } from "@riichi/core";
import { createApp } from "../../app";
import { loadConfig } from "../../config";
import type { RecognitionSessionRow } from "../../db/recognitionSessions";

const summary: RecognitionSessionSummary = {
  source: "room",
  outcome: "abandoned",
  modelId: "d1ec564d-e44a-404e-9140-cf9ea22d1366",
  durationMs: 18_400,
  frames: 52,
  settledFrames: 40,
  secondPasses: 3,
  msAvg: 236,
  blocking: { count: 31 },
  keyChanges: 17,
  maxVotes: 2,
  rotation: 0,
  rotationSource: "none",
  video: "1080x1920",
  viewport: "390x844",
};

let dataDir: string;
let ctx: ReturnType<typeof createApp>;
let token = "";

const post = (body: unknown, tok = token) =>
  ctx.app.request("/api/recognition-sessions", {
    method: "POST",
    headers: {
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "riichi-sess-"));
  const config = { ...loadConfig({}), dataDir, corsOrigins: [], webDist: "/nonexistent" };
  ctx = createApp({ config, dbFile: ":memory:", quiet: true });
  const res = await ctx.app.request("/api/me/register", { method: "POST", body: "{}" });
  token = ((await res.json()) as { token: string }).token;
});

afterAll(() => {
  ctx.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("POST /api/recognition-sessions", () => {
  it("落一行：来源与收场方式单列，其余整体存 JSON；不回内容", async () => {
    const res = await post(summary);
    expect(res.status).toBe(204);
    const rows = ctx.db
      .prepare("SELECT * FROM recognition_sessions")
      .all() as unknown as RecognitionSessionRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "room", outcome: "abandoned" });
    expect(JSON.parse(rows[0]!.summary)).toEqual(summary);
  });

  it("没登录 401；摘要不合法 400；过大 413", async () => {
    expect((await post(summary, "")).status).toBe(401);
    expect((await post({ ...summary, outcome: "crashed" })).status).toBe(400);
    expect((await post({ ...summary, junk: "x".repeat(9000) })).status).toBe(413);
  });
});
