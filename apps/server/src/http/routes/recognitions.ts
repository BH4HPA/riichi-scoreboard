import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { DomainError, validateRecognitionPatch } from "@riichi/core";
import { requirePlayer, type AuthEnv } from "../../auth/deviceToken";
import type { PlayersRepo } from "../../db/players";
import type { RecognitionsRepo } from "../../db/recognitions";
import type { ObjectStore } from "../../storage";
import { RECOGNITION_PHOTO_MAX_BYTES } from "@riichi/core";
import { PhotoError, savePhoto, validatePhoto } from "../photos";
import { SlidingWindow } from "../rateLimit";

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

/** 每玩家 + 全局两级窗口；坏照片不计入（由调用方在校验通过后才计）。 */
export class UploadLimiter {
  private readonly perPlayer = new SlidingWindow(UPLOADS_PER_HOUR);
  private readonly global = new SlidingWindow(UPLOADS_PER_HOUR_GLOBAL);

  allow(playerId: string, now: number): boolean {
    return this.perPlayer.allow(playerId, now) && this.global.allow("*", now);
  }
}

const tooLarge = (max: string) =>
  bodyLimit({
    maxSize: max === "photo" ? RECOGNITION_PHOTO_MAX_BYTES : PATCH_MAX_BYTES,
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
    // 请求体已经被裸 JPEG 占用，来源只能走 query
    const source = c.req.query("source") ?? "room";
    // label 仍收：旧前端（开发者标注页）在新服务端上线后还可能发
    if (source !== "room" && source !== "label" && source !== "calc") {
      return c.json({ error: "bad_source", message: "来源只能是 room、label 或 calc" }, 400);
    }
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
    const id = deps.recognitions.create(player.id, key, deps.modelId, source, t);
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
