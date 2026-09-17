import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { DomainError, RulesError, validateEvaluateRequest } from "@riichi/core";
import { requirePlayer, type AuthEnv } from "../../auth/deviceToken";
import type { PlayersRepo } from "../../db/players";
import { evaluateHand } from "../../engine/evaluate";

const JSON_MAX_BYTES = 16 * 1024;

/**
 * 房间外算番（拍照算点数页）：`POST /` {hand, rules, roundWind, seatWind} → EvaluatedHand。
 * 房间里的评估走 WS，场况取自牌局；这里没有牌局，规则与场况都由请求自带。
 * 庄家固定坐 0 号位，自风即座位号（`seatWind(seat, 0) === seat`）。
 */
export function evaluateRoutes(deps: { players: PlayersRepo }): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use("*", requirePlayer(deps.players));

  const limit = bodyLimit({
    maxSize: JSON_MAX_BYTES,
    onError: (c) => c.json({ error: "too_large", message: "请求体过大" }, 413),
  });
  app.post("/", limit, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    try {
      const req = validateEvaluateRequest(body);
      const result = evaluateHand(
        req.hand,
        { seat: req.seatWind, dealer: 0, roundWind: req.roundWind },
        req.rules,
      );
      return c.json(result);
    } catch (err) {
      if (err instanceof DomainError) return c.json({ error: err.code, message: err.message }, 400);
      if (err instanceof RulesError) return c.json({ error: "rules", message: err.message }, 400);
      throw err;
    }
  });

  return app;
}
