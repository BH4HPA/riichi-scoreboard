import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { DomainError, RECOGNITION_MANIFEST, validateRecognitionPatch } from "@riichi/core";
import { requirePlayer, type AuthEnv } from "../../auth/deviceToken";
import type { PlayersRepo } from "../../db/players";
import type { RecognitionsRepo } from "../../db/recognitions";
import { RecognizerBusy, type ServerRecognizer } from "../../recognition/recognizer";
import type { ObjectStore } from "../../storage";
import { PHOTO_MAX_BYTES, PhotoError, savePhoto } from "../photos";

interface Deps {
  players: PlayersRepo;
  recognitions: RecognitionsRepo;
  store: ObjectStore;
  recognizer: ServerRecognizer | null;
  now?: () => number;
}

const PATCH_MAX_BYTES = 64 * 1024;
/** 每玩家每小时的照片上传上限（照片进对象存储，防刷） */
export const UPLOADS_PER_HOUR = 60;

/** 滑动窗口计数：playerId → 最近一小时内的上传时间戳。 */
class UploadLimiter {
  private readonly hits = new Map<string, number[]>();

  allow(playerId: string, now: number): boolean {
    const since = now - 60 * 60 * 1000;
    const recent = (this.hits.get(playerId) ?? []).filter((t) => t > since);
    if (recent.length >= UPLOADS_PER_HOUR) {
      this.hits.set(playerId, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(playerId, recent);
    return true;
  }
}

/**
 * 识别记录：
 * - POST /            原始 JPEG 体 → 存照片 + 建记录 → 201 {id, result}；`?infer=1` 由服务器引擎识别（未启用 → 503，不落库）
 * - PATCH /:id        手机端回填 {engine, ms, detections, recognized}，结算后回填 {corrected}
 */
export function recognitionRoutes(deps: Deps): Hono {
  const now = deps.now ?? Date.now;
  const limiter = new UploadLimiter();
  const app = new Hono();
  const authed = new Hono<AuthEnv>();
  authed.use("*", requirePlayer(deps.players));

  authed.post("/", bodyLimit({ maxSize: PHOTO_MAX_BYTES }), async (c) => {
    const infer = c.req.query("infer") === "1";
    if (infer && !deps.recognizer?.ready()) {
      return c.json({ error: "recognition_unavailable", message: "服务器识别未启用" }, 503);
    }
    const player = c.get("player");
    const t = now();
    if (!limiter.allow(player.id, t)) {
      return c.json({ error: "too_many", message: "识别次数过多，请稍后再试" }, 429);
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    let key: string;
    try {
      key = await savePhoto(deps.store, player.id, bytes, t);
    } catch (err) {
      if (err instanceof PhotoError) return c.json({ error: err.code, message: err.message }, 400);
      throw err;
    }
    const id = deps.recognitions.create(player.id, key, RECOGNITION_MANIFEST.model?.id ?? "", t);
    if (!infer) return c.json({ id, result: null }, 201);
    try {
      const result = await deps.recognizer!.recognize(bytes);
      deps.recognitions.patch(
        id,
        player.id,
        { engine: "server", ms: result.ms, detections: result.detections, recognized: result.hand },
        now(),
      );
      return c.json({ id, result }, 201);
    } catch (err) {
      if (err instanceof RecognizerBusy)
        return c.json({ error: "too_busy", message: err.message }, 429);
      throw err;
    }
  });

  authed.patch("/:id", bodyLimit({ maxSize: PATCH_MAX_BYTES }), async (c) => {
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
