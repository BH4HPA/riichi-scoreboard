import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { MAX_PRESETS_PER_PLAYER, type PresetsRepo } from "../../db/presets";
import { toPlayerRef, type PlayersRepo } from "../../db/players";
import type { ResultsRepo } from "../../db/results";
import { validateRules, RulesError, type RoomRules } from "@riichi/core";
import { requirePlayer, type AuthEnv } from "../../auth/deviceToken";
import type { RoomRegistry } from "../../rooms/registry";

interface Deps {
  players: PlayersRepo;
  presets: PresetsRepo;
  results: ResultsRepo;
  registry: RoomRegistry;
  avatarsDir: string;
}

const JSON_MAX_BYTES = 16 * 1024;

const AVATAR_MAX_BYTES = 300 * 1024;
const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45
  )
    return "image/webp";
  return null;
}

function cleanName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  return name.length >= 1 && name.length <= 12 ? name : null;
}

export function meRoutes(deps: Deps): Hono {
  const app = new Hono();
  const jsonLimit = bodyLimit({ maxSize: JSON_MAX_BYTES });

  function removeAvatarFiles(playerId: string): void {
    for (const ext of Object.values(AVATAR_TYPES)) {
      fs.rmSync(path.join(deps.avatarsDir, `${playerId}.${ext}`), { force: true });
    }
  }

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
    if (body.avatar === null) {
      patch.avatar = null;
      removeAvatarFiles(c.get("player").id);
    }
    const row = deps.players.update(c.get("player").id, patch);
    deps.registry.syncProfile(toPlayerRef(row));
    return c.json({ player: toPlayerRef(row) });
  });

  /** 头像：客户端已缩放到 256px，服务端只校验类型与大小。 */
  authed.post("/avatar", bodyLimit({ maxSize: AVATAR_MAX_BYTES }), async (c) => {
    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > AVATAR_MAX_BYTES) {
      return c.json({ error: "bad_avatar", message: "头像需为不超过 300KB 的图片" }, 400);
    }
    const type = sniff(buf);
    const ext = type ? AVATAR_TYPES[type] : undefined;
    if (!type || !ext)
      return c.json({ error: "bad_avatar", message: "仅支持 JPEG / PNG / WebP" }, 400);
    const player = c.get("player");
    fs.mkdirSync(deps.avatarsDir, { recursive: true });
    removeAvatarFiles(player.id);
    fs.writeFileSync(path.join(deps.avatarsDir, `${player.id}.${ext}`), buf);
    const url = `/api/avatars/${player.id}.${ext}?v=${Date.now()}`;
    const row = deps.players.update(player.id, { avatar: url });
    deps.registry.syncProfile(toPlayerRef(row));
    return c.json({ player: toPlayerRef(row) });
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
