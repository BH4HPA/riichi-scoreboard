import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
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
}

export function createApp({ config, dbFile, upgradeWebSocket }: CreateAppOptions): AppContext {
  const db = openDatabase(dbFile ?? path.join(config.dataDir, "riichi.sqlite"));
  const players = new PlayersRepo(db);
  const rooms = new RoomsRepo(db);
  const results = new ResultsRepo(db);
  const presets = new PresetsRepo(db);
  const registry = new RoomRegistry(rooms, results);
  const avatarsDir = path.join(config.dataDir, "avatars");

  const app = new Hono();
  if (config.corsOrigins.length > 0) {
    app.use(
      "/api/*",
      cors({ origin: config.corsOrigins, allowHeaders: ["Authorization", "Content-Type"] }),
    );
  }

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/api/me", meRoutes({ players, presets, results, avatarsDir }));
  app.route("/api/rooms", roomRoutes({ registry, players }));
  app.get("/api/avatars/:file", (c) => {
    const file = path.basename(c.req.param("file"));
    const full = path.join(avatarsDir, file);
    if (!fs.existsSync(full)) return c.notFound();
    const ext = path.extname(file).slice(1);
    const type = ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : "image/webp";
    return c.body(fs.readFileSync(full), 200, {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });

  if (upgradeWebSocket) mountWebSocket(app, upgradeWebSocket, { registry, players });
  mountStatic(app, config.webDist);

  return { app, db, registry, players };
}
