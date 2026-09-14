import type { Context, MiddlewareHandler } from "hono";
import type { PlayerRow, PlayersRepo } from "../db/players";

export type AuthEnv = { Variables: { player: PlayerRow } };

function bearerToken(c: Context): string | null {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

/** 设备 token → players 行；无效则 401。 */
export function requirePlayer(players: PlayersRepo): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const token = bearerToken(c);
    const player = token ? players.byToken(token) : null;
    if (!player) return c.json({ error: "unauthorized", message: "需要有效的设备 token" }, 401);
    players.touch(player.id, Date.now());
    c.set("player", player);
    await next();
  };
}
