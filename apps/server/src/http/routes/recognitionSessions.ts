import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  DomainError,
  isRecognitionSessionId,
  RECOGNITION_PHOTO_MAX_BYTES,
  SAMPLE_MAX,
  validateRecognitionSample,
  validateRecognitionSession,
  type RecognitionSampleMeta,
} from "@riichi/core";
import { requirePlayer, type AuthEnv } from "../../auth/deviceToken";
import type { PlayersRepo } from "../../db/players";
import type { RecognitionSamplesRepo } from "../../db/recognitionSamples";
import type { RecognitionSessionsRepo } from "../../db/recognitionSessions";
import type { ObjectStore } from "../../storage";
import { PhotoError, savePhoto, validatePhoto } from "../photos";
import { SlidingWindow } from "../rateLimit";
import { UploadLimiter } from "./recognitions";

interface Deps {
  players: PlayersRepo;
  sessions: RecognitionSessionsRepo;
  samples: RecognitionSamplesRepo;
  store: ObjectStore;
}

const MAX_BYTES = 8 * 1024;
/** 一次取景一条；注册是免费的，所以再加一层全局总量兜底 */
export const SESSIONS_PER_HOUR = 120;
export const SESSIONS_PER_HOUR_GLOBAL = 1200;
/** 采样帧：一次放弃最多 SAMPLE_MAX 帧，整幅画面比定格照大得多，额度与定格照分开记，互不挤占 */
export const SAMPLES_PER_HOUR = 60;
export const SAMPLES_PER_HOUR_GLOBAL = 600;
/** multipart 总长：照片上限 + 元数据（检测框最多 300 个，远到不了 64 KB）+ 分隔符 */
export const SAMPLE_BODY_MAX_BYTES = RECOGNITION_PHOTO_MAX_BYTES + 64 * 1024;

const tooLarge = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: (c) => c.json({ error: "too_large", message: "请求体过大" }, 413),
  });

type Parsed = { photo: Uint8Array; meta: unknown } | { error: string };

/** 只收 photo（单个文件）与 meta（JSON 字符串）两个字段；多一个、重复一个都拒收 */
async function readSample(form: Record<string, unknown>): Promise<Parsed> {
  const keys = Object.keys(form).sort();
  if (keys.length !== 2 || keys[0] !== "meta" || keys[1] !== "photo")
    return { error: "只接受 photo 与 meta 两个字段" };
  const { photo, meta } = form;
  // parseBody({ all: true }) 把重复字段收成数组：多张照片、多份元数据在这里都会被挡住
  if (!(photo instanceof File)) return { error: "photo 必须是单个文件" };
  if (typeof meta !== "string") return { error: "meta 必须是 JSON 字符串" };
  try {
    return { photo: new Uint8Array(await photo.arrayBuffer()), meta: JSON.parse(meta) as unknown };
  } catch {
    return { error: "meta 不是合法的 JSON" };
  }
}

/**
 * 取景会话：
 * - POST /                   {RecognitionSessionSummary} → 204。取景页关闭时发一条（页面可能正在卸载，
 *                            所以不回内容、客户端也不等）；同一 id 重发也是 204。
 * - POST /:id/samples/:seq   multipart {photo, meta} → 201（已存）/ 204（这一帧早已存过）。
 *                            放弃取景、或折腾很久才定格时的整幅画面，逐帧上传；只认玩家身份，
 *                            **不要求会话行已存在**：摘要被限流挡掉时采样帧仍能留下。
 */
export function recognitionSessionRoutes(deps: Deps): Hono {
  const now = Date.now;
  const perPlayer = new SlidingWindow(SESSIONS_PER_HOUR);
  const global = new SlidingWindow(SESSIONS_PER_HOUR_GLOBAL);
  const sampleLimiter = new UploadLimiter(SAMPLES_PER_HOUR, SAMPLES_PER_HOUR_GLOBAL);
  const app = new Hono();
  const authed = new Hono<AuthEnv>();
  authed.use("*", requirePlayer(deps.players));

  authed.post("/", tooLarge(MAX_BYTES), async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    let summary;
    try {
      summary = validateRecognitionSession(body);
    } catch (err) {
      if (err instanceof DomainError) return c.json({ error: err.code, message: err.message }, 400);
      throw err;
    }
    const player = c.get("player");
    const t = now();
    if (!perPlayer.allow(player.id, t) || !global.allow("*", t)) {
      return c.json({ error: "too_many", message: "上报过多，请稍后再试" }, 429);
    }
    deps.sessions.create(player.id, summary, t);
    return c.body(null, 204);
  });

  authed.post(
    "/:id/samples/:seq",
    // 路径参数先验：不合格的请求不必读体
    async (c, next) => {
      const seq = Number(c.req.param("seq"));
      if (!isRecognitionSessionId(c.req.param("id")))
        return c.json({ error: "bad_session", message: "会话 id 无效" }, 400);
      if (!/^\d+$/.test(c.req.param("seq")) || seq >= SAMPLE_MAX)
        return c.json({ error: "bad_seq", message: `序号只能是 0–${SAMPLE_MAX - 1}` }, 400);
      await next();
    },
    // 解析 multipart 之前按总长拦截：没有 Content-Length（分块传输）时 bodyLimit 边读边数
    tooLarge(SAMPLE_BODY_MAX_BYTES),
    async (c) => {
      const sessionId = c.req.param("id");
      const seq = Number(c.req.param("seq"));
      const player = c.get("player");
      const t = now();
      // 重传（上次其实已落库、只是响应没回来）：不再存一份照片，也不占额度
      if (deps.samples.has(sessionId, seq)) return c.body(null, 204);
      const form = await c.req.parseBody({ all: true }).catch(() => null);
      const parsed = form ? await readSample(form) : { error: "请求体不是 multipart" };
      if ("error" in parsed) return c.json({ error: "bad_sample", message: parsed.error }, 400);
      let meta: RecognitionSampleMeta;
      try {
        validatePhoto(parsed.photo);
        meta = validateRecognitionSample(parsed.meta);
      } catch (err) {
        if (err instanceof PhotoError)
          return c.json({ error: err.code, message: err.message }, 400);
        if (err instanceof DomainError)
          return c.json({ error: err.code, message: err.message }, 400);
        throw err;
      }
      // 校验通过才计数（与定格照同一口径）：前端 meta 有 bug 时坏请求不该把额度耗光；体积已由 bodyLimit 封顶
      if (!sampleLimiter.allow(player.id, t)) {
        return c.json({ error: "too_many", message: "上传过多，请稍后再试" }, 429);
      }
      const key = await savePhoto(deps.store, player.id, parsed.photo, t, "samples");
      // 与另一个同序号的请求并发时后到的写不进去：照片成了孤儿对象，量极小，不值得为它加锁
      const created = deps.samples.create(sessionId, seq, player.id, key, meta, t);
      return c.body(null, created ? 201 : 204);
    },
  );

  app.route("/", authed);
  return app;
}
