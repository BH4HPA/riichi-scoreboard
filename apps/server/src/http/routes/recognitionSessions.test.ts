import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RECOGNITION_PHOTO_MAX_BYTES,
  type RecognitionSampleMeta,
  type RecognitionSessionSummary,
} from "@riichi/core";
import { createApp } from "../../app";
import { loadConfig } from "../../config";
import type { RecognitionSampleRow } from "../../db/recognitionSamples";
import type { RecognitionSessionRow } from "../../db/recognitionSessions";
import { SAMPLE_BODY_MAX_BYTES, SAMPLES_PER_HOUR } from "./recognitionSessions";

/** 最小合法 JPEG 头（只需通过魔数嗅探） */
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9,
]);
const SESSION = "0123456789abcdef";

const meta: RecognitionSampleMeta = {
  modelId: "d1ec564d-e44a-404e-9140-cf9ea22d1366",
  t: 3_000,
  ms: 250,
  frame: { width: 1080, height: 1920 },
  rotation: 0,
  settled: true,
  passes: 1,
  detections: [{ cls: 0, conf: 0.9, box: [10, 20, 50, 76] }],
  hand: {
    closed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14],
    melds: [],
    winTile: 14,
    doraIndicators: [],
    uraIndicators: [],
  },
  warnings: [{ code: "count", message: "只认出 13 张", severity: "blocking" }],
};

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

function form(fields: [string, string | Blob][]): FormData {
  const f = new FormData();
  for (const [k, v] of fields) f.append(k, v);
  return f;
}

const sampleFields = (): [string, string | Blob][] => [
  ["photo", new Blob([JPEG], { type: "image/jpeg" })],
  ["meta", JSON.stringify(meta)],
];

const postSample = (
  body: FormData | ReadableStream | Uint8Array,
  {
    id = SESSION,
    seq = "0",
    tok = token,
    app = ctx.app,
    headers = {} as Record<string, string>,
  } = {},
) =>
  app.request(`/api/recognition-sessions/${id}/samples/${seq}`, {
    method: "POST",
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...headers },
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);

const samples = () =>
  ctx.db
    .prepare("SELECT * FROM recognition_samples ORDER BY created_at, seq")
    .all() as unknown as RecognitionSampleRow[];

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
    expect((await post({ ...summary, id: "nope" })).status).toBe(400);
    expect((await post({ ...summary, junk: "x".repeat(9000) })).status).toBe(413);
  });

  it("带客户端 id 就用它；同一 id 重发是 204 且不改写先到的那行（不再 500）", async () => {
    const id = "fedcba9876543210";
    expect((await post({ ...summary, id })).status).toBe(204);
    expect((await post({ ...summary, id, outcome: "auto" })).status).toBe(204);
    const rows = ctx.db
      .prepare("SELECT * FROM recognition_sessions WHERE id = ?")
      .all(id) as unknown as RecognitionSessionRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outcome).toBe("abandoned");
  });
});

describe("POST /api/recognition-sessions/:id/samples/:seq", () => {
  it("存照片（samples/ 前缀，私有）+ 落一行；不要求会话行已存在；同一帧重传 204 不再存", async () => {
    const res = await postSample(form(sampleFields()));
    expect(res.status).toBe(201);
    const [row] = samples();
    expect(row).toMatchObject({ session_id: SESSION, seq: 0 });
    expect(row!.photo_key).toMatch(/^samples\/[0-9a-f]+\/\d{8}-[0-9a-f]{12}\.jpg$/);
    expect(fs.existsSync(path.join(dataDir, "objects", row!.photo_key))).toBe(true);
    expect(JSON.parse(row!.meta)).toEqual(meta);
    expect(
      ctx.db.prepare("SELECT COUNT(*) AS n FROM recognition_sessions WHERE id = ?").get(SESSION),
    ).toEqual({ n: 0 });
    // 公开 URL 读不到
    expect((await ctx.app.request(`/api/objects/${row!.photo_key}`)).status).toBe(404);

    expect((await postSample(form(sampleFields()))).status).toBe(204);
    expect(samples()).toHaveLength(1);
    expect((await postSample(form(sampleFields()), { seq: "5" })).status).toBe(201);
  });

  it("路径参数先验：会话 id 不是 16 位 hex、序号越界或不是整数 → 400", async () => {
    const cases: [string, string, string][] = [
      ["ABCDEF0123456789", "0", "bad_session"],
      [SESSION, "6", "bad_seq"],
      [SESSION, "-1", "bad_seq"],
      [SESSION, "1.5", "bad_seq"],
      [SESSION, "x", "bad_seq"],
    ];
    for (const [id, seq, error] of cases) {
      const res = await postSample(form(sampleFields()), { id, seq });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(error);
    }
  });

  it("只收 photo（单个文件）与 meta：多字段、缺字段、两张照片、photo 不是文件、meta 坏 → 400", async () => {
    const photo = new Blob([JPEG], { type: "image/jpeg" });
    const bodies: [string, string | Blob][][] = [
      [...sampleFields(), ["extra", "x"]],
      [["photo", photo]],
      [
        ["photo", photo],
        ["photo", photo],
        ["meta", JSON.stringify(meta)],
      ],
      [
        ["photo", "not a file"],
        ["meta", JSON.stringify(meta)],
      ],
      [
        ["photo", photo],
        ["meta", "{"],
      ],
      [
        ["photo", photo],
        ["meta", JSON.stringify({ ...meta, rotation: 180 })],
      ],
      [
        ["photo", new Blob([new Uint8Array([1, 2, 3])])],
        ["meta", JSON.stringify(meta)],
      ],
    ];
    for (const [i, fields] of bodies.entries()) {
      const res = await postSample(form(fields), { seq: "1" });
      expect(res.status, `第 ${i} 个`).toBe(400);
    }
    expect((await postSample(new Uint8Array([1, 2]), { seq: "1" })).status).toBe(400);
    expect(samples().filter((r) => r.seq === 1)).toHaveLength(0);
  });

  it("没登录 401；超过总长 413（带 Content-Length 与分块传输都拦在解析之前）", async () => {
    expect((await postSample(form(sampleFields()), { tok: "" })).status).toBe(401);
    const big = new Uint8Array(SAMPLE_BODY_MAX_BYTES + 1);
    big.set(JPEG);
    const withLength = await postSample(
      form([
        ["photo", new Blob([big], { type: "image/jpeg" })],
        ["meta", JSON.stringify(meta)],
      ]),
      { seq: "2" },
    );
    expect(withLength.status).toBe(413);
    // 没有 Content-Length：bodyLimit 边读边数
    const chunk = new Uint8Array(512 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > RECOGNITION_PHOTO_MAX_BYTES * 2) return controller.close();
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const chunked = await postSample(stream, {
      seq: "2",
      headers: { "Content-Type": "multipart/form-data; boundary=x" },
    });
    expect(chunked.status).toBe(413);
    expect(((await chunked.json()) as { error: string }).error).toBe("too_large");
    expect(samples().filter((r) => r.seq === 2)).toHaveLength(0);
  });

  it(`限流：每人每小时 ${SAMPLES_PER_HOUR} 帧，与摘要、定格照的额度互不相干`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "riichi-samp-"));
    const app2 = createApp({
      config: { ...loadConfig({}), dataDir: dir, corsOrigins: [], webDist: "/nonexistent" },
      dbFile: ":memory:",
      quiet: true,
    });
    const reg = await app2.app.request("/api/me/register", { method: "POST", body: "{}" });
    const tok = ((await reg.json()) as { token: string }).token;
    const id = (i: number) => i.toString(16).padStart(16, "0");
    for (let i = 0; i < SAMPLES_PER_HOUR; i++) {
      const res = await postSample(form(sampleFields()), { id: id(i), tok, app: app2.app });
      expect(res.status).toBe(201);
    }
    const over = await postSample(form(sampleFields()), { id: id(999), tok, app: app2.app });
    expect(over.status).toBe(429);
    // 已经存过的那一帧重传不占额度，照样 204
    expect((await postSample(form(sampleFields()), { id: id(0), tok, app: app2.app })).status).toBe(
      204,
    );
    // 摘要的额度独立
    const summaryRes = await app2.app.request("/api/recognition-sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify(summary),
    });
    expect(summaryRes.status).toBe(204);
    app2.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
