import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { DomainError, validateRecognitionSession } from "@riichi/core";
import { requirePlayer, type AuthEnv } from "../../auth/deviceToken";
import type { PlayersRepo } from "../../db/players";
import type { RecognitionSessionsRepo } from "../../db/recognitionSessions";
import { SlidingWindow } from "../rateLimit";

interface Deps {
  players: PlayersRepo;
  sessions: RecognitionSessionsRepo;
}

const MAX_BYTES = 8 * 1024;
/** 一次取景一条；注册是免费的，所以再加一层全局总量兜底 */
export const SESSIONS_PER_HOUR = 120;
export const SESSIONS_PER_HOUR_GLOBAL = 1200;

/**
 * 取景会话摘要：POST / {RecognitionSessionSummary} → 204。
 * 取景页关闭时发一条（页面可能正在卸载，所以不回内容、客户端也不等）；不含照片。
 */
export function recognitionSessionRoutes(deps: Deps): Hono {
  const now = Date.now;
  const perPlayer = new SlidingWindow(SESSIONS_PER_HOUR);
  const global = new SlidingWindow(SESSIONS_PER_HOUR_GLOBAL);
  const app = new Hono();
  const authed = new Hono<AuthEnv>();
  authed.use("*", requirePlayer(deps.players));

  authed.post(
    "/",
    bodyLimit({
      maxSize: MAX_BYTES,
      onError: (c) => c.json({ error: "too_large", message: "请求体过大" }, 413),
    }),
    async (c) => {
      const body: unknown = await c.req.json().catch(() => null);
      let summary;
      try {
        summary = validateRecognitionSession(body);
      } catch (err) {
        if (err instanceof DomainError)
          return c.json({ error: err.code, message: err.message }, 400);
        throw err;
      }
      const player = c.get("player");
      const t = now();
      if (!perPlayer.allow(player.id, t) || !global.allow("*", t)) {
        return c.json({ error: "too_many", message: "上报过多，请稍后再试" }, 429);
      }
      deps.sessions.create(player.id, summary, t);
      return c.body(null, 204);
    },
  );

  app.route("/", authed);
  return app;
}
