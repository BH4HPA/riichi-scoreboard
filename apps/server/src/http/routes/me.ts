import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { MAX_PRESETS_PER_PLAYER, type PresetsRepo } from "../../db/presets";
import { toPlayerRef, type PlayersRepo } from "../../db/players";
import type { ResultsRepo } from "../../db/results";
import { validateRules, RulesError, type RoomRules } from "@riichi/core";
import { requirePlayer, type AuthEnv } from "../../auth/deviceToken";
import type { RoomRegistry } from "../../rooms/registry";
import type { ObjectStore } from "../../storage";
import { AVATAR_MAX_BYTES, AvatarError, clearAvatar, saveAvatar } from "../avatars";

interface Deps {
  players: PlayersRepo;
  presets: PresetsRepo;
  results: ResultsRepo;
  registry: RoomRegistry;
  store: ObjectStore;
}

const JSON_MAX_BYTES = 16 * 1024;

export function cleanName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  return name.length >= 1 && name.length <= 12 ? name : null;
}

export function meRoutes(deps: Deps): Hono {
  const app = new Hono();
  const jsonLimit = bodyLimit({ maxSize: JSON_MAX_BYTES });

  /** 首次访问：签发设备 token。 */
  app.post("/register", jsonLimit, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = cleanName(body.name) ?? "玩家";
    const row = deps.players.create(name, Date.now());
    return c.json({ token: row.token, player: toPlayerRef(row) }, 201);
  });

  const authed = new Hono<AuthEnv>();
  authed.use("*", requirePlayer(deps.players));

  authed.get("/", (c) => c.json({ player: toPlayerRef(c.get("player")) }));

  authed.patch("/", jsonLimit, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; avatar?: unknown };
    const patch: { name?: string; avatar?: string | null } = {};
    if (body.name !== undefined) {
      const name = cleanName(body.name);
      if (!name) return c.json({ error: "bad_name", message: "昵称需为 1–12 个字符" }, 400);
      patch.name = name;
    }
    let row = deps.players.update(c.get("player").id, patch);
    if (body.avatar === null) row = await clearAvatar(deps, row);
    deps.registry.syncProfile(toPlayerRef(row));
    return c.json({ player: toPlayerRef(row) });
  });

  authed.post("/avatar", bodyLimit({ maxSize: AVATAR_MAX_BYTES }), async (c) => {
    try {
      const row = await saveAvatar(
        deps,
        c.get("player"),
        new Uint8Array(await c.req.arrayBuffer()),
      );
      deps.registry.syncProfile(toPlayerRef(row));
      return c.json({ player: toPlayerRef(row) });
    } catch (err) {
      if (err instanceof AvatarError) return c.json({ error: err.code, message: err.message }, 400);
      throw err;
    }
  });

  authed.get("/presets", (c) => c.json({ presets: deps.presets.list(c.get("player").id) }));

  authed.post("/presets", jsonLimit, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; rules?: unknown };
    const name = cleanName(body.name);
    if (!name) return c.json({ error: "bad_name", message: "预设名称需为 1–12 个字符" }, 400);
    let rules: RoomRules;
    try {
      rules = validateRules(body.rules);
    } catch (err) {
      return c.json(
        { error: "rules", message: err instanceof RulesError ? err.message : "规则格式错误" },
        400,
      );
    }
    const playerId = c.get("player").id;
    if (deps.presets.count(playerId) >= MAX_PRESETS_PER_PLAYER) {
      return c.json(
        { error: "too_many", message: `最多保存 ${MAX_PRESETS_PER_PLAYER} 个预设` },
        400,
      );
    }
    return c.json({ preset: deps.presets.create(playerId, name, rules, Date.now()) }, 201);
  });

  authed.delete("/presets/:id", (c) => {
    const ok = deps.presets.remove(c.get("player").id, c.req.param("id"));
    return ok ? c.body(null, 204) : c.json({ error: "not_found", message: "预设不存在" }, 404);
  });

  authed.get("/stats", (c) => c.json({ stats: deps.results.statsFor(c.get("player").id) }));

  app.route("/", authed);
  return app;
}
