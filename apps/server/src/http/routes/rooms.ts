import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { defaultRules, validateRules, RulesError } from "@riichi/core";
import { requirePlayer, type AuthEnv } from "../../auth/deviceToken";
import type { PlayersRepo } from "../../db/players";
import { RoomClosed, RoomNotFound, type RoomRegistry } from "../../rooms/registry";
import { rateLimit, SlidingWindow } from "../rateLimit";

interface Deps {
  registry: RoomRegistry;
  players: PlayersRepo;
}

/** 每个设备每小时可建的房间数：房间常驻内存直到闲置卸载，且 rooms 表不删行 */
export const ROOMS_PER_HOUR = 60;

export function roomRoutes(deps: Deps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use("*", requirePlayer(deps.players));
  const createLimit = rateLimit<AuthEnv>(
    new SlidingWindow(ROOMS_PER_HOUR),
    (c) => c.get("player").id,
    "建房过于频繁，请稍后再试",
  );

  /** 主控台建房；可带初始规则。 */
  app.post("/", createLimit, bodyLimit({ maxSize: 16 * 1024 }), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { rules?: unknown };
    let rules = defaultRules();
    if (body.rules !== undefined) {
      try {
        rules = validateRules(body.rules);
      } catch (err) {
        return c.json(
          { error: "rules", message: err instanceof RulesError ? err.message : "规则格式错误" },
          400,
        );
      }
    }
    const room = deps.registry.createRoom(rules);
    return c.json({ room: deps.registry.view(room) }, 201);
  });

  app.get("/:code", (c) => {
    try {
      const room = deps.registry.get(c.req.param("code").toUpperCase());
      return c.json({ room: deps.registry.view(room) });
    } catch (err) {
      if (err instanceof RoomNotFound)
        return c.json({ error: "room_not_found", message: err.message }, 404);
      if (err instanceof RoomClosed)
        return c.json({ error: "room_closed", message: err.message }, 410);
      throw err;
    }
  });

  return app;
}
