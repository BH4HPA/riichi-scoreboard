import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { UpgradeWebSocket } from "hono/ws";
import type { ServerConfig } from "./config";
import { openDatabase, type Database } from "./db";
import { PlayersRepo } from "./db/players";
import { PresetsRepo } from "./db/presets";
import { ResultsRepo } from "./db/results";
import { RoomsRepo } from "./db/rooms";
import { meRoutes } from "./http/routes/me";
import { roomRoutes } from "./http/routes/rooms";
import { mountStatic } from "./http/static";
import { RoomRegistry } from "./rooms/registry";
import { mountWebSocket } from "./rooms/ws";

export interface AppContext {
  app: Hono;
  db: Database;
  registry: RoomRegistry;
  players: PlayersRepo;
}

export interface CreateAppOptions {
  config: ServerConfig;
  dbFile?: string;
  upgradeWebSocket?: UpgradeWebSocket;
  /** 测试时关闭请求日志 */
  quiet?: boolean;
}

const AVATAR_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function createApp({
  config,
  dbFile,
  upgradeWebSocket,
  quiet = false,
}: CreateAppOptions): AppContext {
  const db = openDatabase(dbFile ?? path.join(config.dataDir, "riichi.sqlite"));
  const players = new PlayersRepo(db);
  const rooms = new RoomsRepo(db);
  const results = new ResultsRepo(db);
  const presets = new PresetsRepo(db);
  const registry = new RoomRegistry(rooms, results, players);
  const avatarsDir = path.join(config.dataDir, "avatars");

  const app = new Hono();
  if (!quiet) app.use("/api/*", logger());
  if (config.corsOrigins.length > 0) {
    app.use(
      "/api/*",
      cors({ origin: config.corsOrigins, allowHeaders: ["Authorization", "Content-Type"] }),
    );
  }

  app.get("/health", (c) => {
    db.prepare("SELECT 1").get();
    return c.json({ ok: true });
  });
  app.route("/api/me", meRoutes({ players, presets, results, registry, avatarsDir }));
  app.route("/api/rooms", roomRoutes({ registry, players }));
  app.get("/api/avatars/:file", (c) => {
    const file = path.basename(c.req.param("file"));
    const type = AVATAR_TYPES[path.extname(file).slice(1)];
    const full = path.join(avatarsDir, file);
    if (!type || !fs.existsSync(full)) return c.notFound();
    return c.body(fs.readFileSync(full), 200, {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });
  app.notFound((c) => c.json({ error: "not_found", message: "接口不存在" }, 404));
  app.onError((err, c) => {
    console.error(`[http] ${c.req.method} ${c.req.path}`, err);
    return c.json({ error: "internal", message: "服务器内部错误" }, 500);
  });

  if (upgradeWebSocket) mountWebSocket(app, upgradeWebSocket, { registry, players });
  mountStatic(app, config.webDist);

  return { app, db, registry, players };
}
