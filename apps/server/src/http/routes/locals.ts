import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { LocalPlayerView } from "@riichi/core";
import { requirePlayer, type AuthEnv } from "../../auth/deviceToken";
import { toPlayerRef, type PlayerRow, type PlayersRepo } from "../../db/players";
import type { ResultsRepo } from "../../db/results";
import type { RoomRegistry } from "../../rooms/registry";
import type { ObjectStore } from "../../storage";
import { AVATAR_MAX_BYTES, AvatarError, clearAvatar, saveAvatar } from "../avatars";
import { cleanName } from "./me";

interface Deps {
  players: PlayersRepo;
  results: ResultsRepo;
  registry: RoomRegistry;
  store: ObjectStore;
}

const JSON_MAX_BYTES = 16 * 1024;
/** 每台主控台设备最多保留的本地玩家数 */
export const MAX_LOCALS_PER_DEVICE = 20;

/**
 * 本地玩家：由主控台设备创建、只在该设备可管理；没有 token，不能登录。
 * 入座走 WS 命令 `sitLocal`；这里只管档案。
 */
export function localRoutes(deps: Deps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use("*", requirePlayer(deps.players));
  const jsonLimit = bodyLimit({ maxSize: JSON_MAX_BYTES });

  const view = (row: PlayerRow): LocalPlayerView => ({
    ...toPlayerRef(row),
    games: deps.results.statsFor(row.id, 0).games,
  });

  /** 当前设备创建的本地玩家；不是则 404（不区分「不存在」与「不是你的」）。 */
  const mine = (c: { get(key: "player"): PlayerRow }, id: string): PlayerRow | null => {
    const row = deps.players.byId(id);
    return row && row.kind === "local" && row.created_by === c.get("player").id ? row : null;
  };

  app.get("/", (c) => c.json({ locals: deps.players.localsOf(c.get("player").id).map(view) }));

  app.post("/", jsonLimit, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = cleanName(body.name);
    if (!name) return c.json({ error: "bad_name", message: "昵称需为 1–12 个字符" }, 400);
    const owner = c.get("player").id;
    if (deps.players.localsOf(owner).length >= MAX_LOCALS_PER_DEVICE) {
      return c.json(
        { error: "too_many", message: `最多创建 ${MAX_LOCALS_PER_DEVICE} 名本地玩家` },
        400,
      );
    }
    return c.json({ local: view(deps.players.createLocal(name, owner, Date.now())) }, 201);
  });

  app.patch("/:id", jsonLimit, async (c) => {
    const row = mine(c, c.req.param("id"));
    if (!row) return c.json({ error: "not_found", message: "本地玩家不存在" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; avatar?: unknown };
    let next = row;
    if (body.name !== undefined) {
      const name = cleanName(body.name);
      if (!name) return c.json({ error: "bad_name", message: "昵称需为 1–12 个字符" }, 400);
      next = deps.players.update(row.id, { name });
    }
    if (body.avatar === null) next = await clearAvatar(deps, next);
    deps.registry.syncProfile(toPlayerRef(next));
    return c.json({ local: view(next) });
  });

  app.post("/:id/avatar", bodyLimit({ maxSize: AVATAR_MAX_BYTES }), async (c) => {
    const row = mine(c, c.req.param("id"));
    if (!row) return c.json({ error: "not_found", message: "本地玩家不存在" }, 404);
    try {
      const next = await saveAvatar(deps, row, new Uint8Array(await c.req.arrayBuffer()));
      deps.registry.syncProfile(toPlayerRef(next));
      return c.json({ local: view(next) });
    } catch (err) {
      if (err instanceof AvatarError) return c.json({ error: err.code, message: err.message }, 400);
      throw err;
    }
  });

  /** 删除档案；战绩与房间事件里的快照保留。 */
  app.delete("/:id", async (c) => {
    const row = mine(c, c.req.param("id"));
    if (!row) return c.json({ error: "not_found", message: "本地玩家不存在" }, 404);
    await clearAvatar(deps, row);
    deps.players.remove(row.id);
    return c.body(null, 204);
  });

  return app;
}
