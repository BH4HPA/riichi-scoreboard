import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { loadConfig } from "../../config";
import type { RecognitionRow } from "../../db/recognitions";
import { PHOTO_MAX_BYTES } from "../photos";
import { UPLOADS_PER_HOUR, UploadLimiter } from "./recognitions";

/** 最小合法 JPEG 头（只需通过魔数嗅探） */
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9,
]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const HAND = {
  closed: [1, 2, 3, 13, 36, 15, 25, 26, 27, 7, 8, 11, 11, 9],
  melds: [],
  winTile: 9,
  tsumo: false,
  doraIndicators: [24],
  uraIndicators: [],
  riichi: false,
  doubleRiichi: false,
  ippatsu: false,
  afterKan: false,
  lastTile: false,
  firstTake: false,
};

let dataDir: string;
let ctx: ReturnType<typeof createApp>;
let token = "";
let other = "";

async function register(app: ReturnType<typeof createApp>["app"]): Promise<string> {
  const res = await app.request("/api/me/register", { method: "POST", body: "{}" });
  return ((await res.json()) as { token: string }).token;
}

async function post(bytes: Uint8Array, tok = token): Promise<Response> {
  return ctx.app.request("/api/recognitions", {
    method: "POST",
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    body: bytes,
  });
}

async function patch(id: string, body: unknown, tok = token): Promise<Response> {
  return ctx.app.request(`/api/recognitions/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function row(id: string): RecognitionRow | undefined {
  return ctx.db.prepare("SELECT * FROM recognitions WHERE id = ?").get(id) as
    RecognitionRow | undefined;
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "riichi-rec-"));
  const config = { ...loadConfig({}), dataDir, corsOrigins: [], webDist: "/nonexistent" };
  ctx = createApp({ config, dbFile: ":memory:", quiet: true });
  token = await register(ctx.app);
  other = await register(ctx.app);
});

afterAll(() => {
  ctx.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("POST /api/recognitions", () => {
  it("无 token → 401；非 JPEG → 400", async () => {
    expect((await post(JPEG, "")).status).toBe(401);
    const res = await post(PNG);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_photo");
  });

  it("JPEG → 201 {id}，照片落在本地对象目录", async () => {
    const res = await post(JPEG);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    const r = row(body.id)!;
    expect(r.photo_key).toMatch(/^hands\/[0-9a-f]+\/\d{8}-[0-9a-f]{12}\.jpg$/);
    expect(fs.existsSync(path.join(dataDir, "objects", r.photo_key))).toBe(true);
    expect(r.model_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("超过 2MB → 413 JSON（HTTPException 透传，不再变成 500）", async () => {
    const big = new Uint8Array(PHOTO_MAX_BYTES + 1);
    big.set(JPEG);
    const res = await post(big);
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe("too_large");
  });

  it("未发布模型 → 409，不落库", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "riichi-rec3-"));
    const app3 = createApp({
      config: { ...loadConfig({}), dataDir: dir, corsOrigins: [], webDist: "/nonexistent" },
      dbFile: ":memory:",
      quiet: true,
      modelId: null,
    });
    const tok = await register(app3.app);
    const res = await app3.app.request("/api/recognitions", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}` },
      body: JPEG,
    });
    expect(res.status).toBe(409);
    expect(app3.db.prepare("SELECT COUNT(*) AS n FROM recognitions").get()).toEqual({ n: 0 });
    app3.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("限流：每人每小时 60 次，全局 600 次；坏照片不计入", () => {
    const l = new UploadLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < UPLOADS_PER_HOUR; i++) expect(l.allow("a", t0 + i)).toBe(true);
    expect(l.allow("a", t0 + 100)).toBe(false);
    expect(l.allow("a", t0 + 60 * 60 * 1000 + 1)).toBe(true); // 一小时后窗口滑出
    const g = new UploadLimiter();
    for (let p = 0; p < 10; p++)
      for (let i = 0; i < UPLOADS_PER_HOUR; i++) expect(g.allow(`p${p}`, t0)).toBe(true);
    expect(g.allow("fresh", t0)).toBe(false);
  });
});

describe("PATCH /api/recognitions/:id", () => {
  it("回填识别结果与确认手牌 → 204；他人 → 404；畸形 → 400", async () => {
    const { id } = (await (await post(JPEG)).json()) as { id: string };
    const res = await patch(id, {
      modelId: "12b2722c-cbce-4e9b-9bd1-341280bd0204",
      ms: 812,
      detections: [{ cls: 3, conf: 0.9, box: [1, 2, 3, 4] }],
      recognized: { closed: [1, 2], melds: [], winTile: 2, doraIndicators: [], uraIndicators: [] },
    });
    expect(res.status).toBe(204);
    expect((await patch(id, { corrected: HAND })).status).toBe(204);
    const r = row(id)!;
    expect(r.model_id).toBe("12b2722c-cbce-4e9b-9bd1-341280bd0204");
    expect(JSON.parse(r.recognized!).winTile).toBe(2);
    expect(JSON.parse(r.corrected!).winTile).toBe(9);
    expect((await patch(id, { ms: 1 }, other)).status).toBe(404);
    expect((await patch("nope", { ms: 1 })).status).toBe(404);
    const bad = await patch(id, { modelId: "gpu" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("bad_recognition");
    expect((await patch(id, {})).status).toBe(400);
  });
});
