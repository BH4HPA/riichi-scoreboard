import { Hono } from "hono";
import { defaultRules, validateRules, RulesError } from "@riichi/core";
import { requirePlayer, type AuthEnv } from "../../auth/deviceToken";
import type { PlayersRepo } from "../../db/players";
import { RoomNotFound, type RoomRegistry } from "../../rooms/registry";

interface Deps {
  registry: RoomRegistry;
  players: PlayersRepo;
}

export function roomRoutes(deps: Deps): Hono {
  const app = new Hono<AuthEnv>();
  app.use("*", requirePlayer(deps.players));

  /** 主控台建房；可带初始规则。 */
  app.post("/", async (c) => {
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
      throw err;
    }
  });

  return app as unknown as Hono;
}
