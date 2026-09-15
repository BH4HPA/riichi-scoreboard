import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { DomainError, validateRecognitionPatch } from "@riichi/core";
import { requirePlayer, type AuthEnv } from "../../auth/deviceToken";
import type { PlayersRepo } from "../../db/players";
import type { RecognitionsRepo } from "../../db/recognitions";
import type { ObjectStore } from "../../storage";
import { PHOTO_MAX_BYTES, PhotoError, savePhoto, validatePhoto } from "../photos";

interface Deps {
  players: PlayersRepo;
  recognitions: RecognitionsRepo;
  store: ObjectStore;
  /** 当前发布的模型 id；null = 未发布，拒收照片 */
  modelId: string | null;
}

const PATCH_MAX_BYTES = 64 * 1024;
/** 每玩家每小时的照片上传上限；注册是免费的，所以再加一层全局总量兜底（照片进对象存储永久保存） */
export const UPLOADS_PER_HOUR = 60;
export const UPLOADS_PER_HOUR_GLOBAL = 600;
const HOUR = 60 * 60 * 1000;

/** 滑动窗口计数：playerId → 最近一小时内的上传时间戳；另有全局窗口。 */
export class UploadLimiter {
  private readonly hits = new Map<string, number[]>();
  private global: number[] = [];

  allow(playerId: string, now: number): boolean {
    const since = now - HOUR;
    if (this.hits.size > 1000) this.sweep(since);
    this.global = this.global.filter((t) => t > since);
    const recent = (this.hits.get(playerId) ?? []).filter((t) => t > since);
    if (recent.length >= UPLOADS_PER_HOUR || this.global.length >= UPLOADS_PER_HOUR_GLOBAL) {
      this.hits.set(playerId, recent);
      return false;
    }
    recent.push(now);
    this.global.push(now);
    this.hits.set(playerId, recent);
    return true;
  }

  private sweep(since: number): void {
    for (const [id, ts] of this.hits) {
      if (!ts.some((t) => t > since)) this.hits.delete(id);
    }
  }
}

const tooLarge = (max: string) =>
  bodyLimit({
    maxSize: max === "photo" ? PHOTO_MAX_BYTES : PATCH_MAX_BYTES,
    onError: (c) => c.json({ error: "too_large", message: "请求体过大" }, 413),
  });

/**
 * 识别记录：
 * - POST /            原始 JPEG 体 → 存照片 + 建记录 → 201 {id}（推理在手机上跑）
 * - PATCH /:id        手机端回填 {modelId, ms, detections, recognized}，结算后回填 {corrected}
 */
export function recognitionRoutes(deps: Deps): Hono {
  const now = Date.now;
  const limiter = new UploadLimiter();
  const app = new Hono();
  const authed = new Hono<AuthEnv>();
  authed.use("*", requirePlayer(deps.players));

  authed.post("/", tooLarge("photo"), async (c) => {
    if (!deps.modelId) return c.json({ error: "no_model", message: "尚未发布识别模型" }, 409);
    const player = c.get("player");
    const t = now();
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    try {
      validatePhoto(bytes);
    } catch (err) {
      if (err instanceof PhotoError) return c.json({ error: err.code, message: err.message }, 400);
      throw err;
    }
    if (!limiter.allow(player.id, t)) {
      return c.json({ error: "too_many", message: "识别次数过多，请稍后再试" }, 429);
    }
    const key = await savePhoto(deps.store, player.id, bytes, t);
    const id = deps.recognitions.create(player.id, key, deps.modelId, t);
    return c.json({ id }, 201);
  });

  authed.patch("/:id", tooLarge("patch"), async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    let patch;
    try {
      patch = validateRecognitionPatch(body);
    } catch (err) {
      if (err instanceof DomainError) return c.json({ error: err.code, message: err.message }, 400);
      throw err;
    }
    const ok = deps.recognitions.patch(c.req.param("id"), c.get("player").id, patch, now());
    return ok ? c.body(null, 204) : c.json({ error: "not_found", message: "记录不存在" }, 404);
  });

  app.route("/", authed);
  return app;
}
