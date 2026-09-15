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
import type { ObjectStore } from "./storage";
import { CosStore } from "./storage/cos";
import { LocalStore, LOCAL_OBJECTS_ROUTE } from "./storage/local";

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

const OBJECT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** 本地对象存储的托管路由：只认白名单扩展名，key 经 LocalStore 校验防穿越。 */
function mountLocalObjects(app: Hono, store: LocalStore): void {
  app.get(`${LOCAL_OBJECTS_ROUTE}/*`, (c) => {
    const key = c.req.path.slice(LOCAL_OBJECTS_ROUTE.length + 1);
    const type = OBJECT_TYPES[path.extname(key).slice(1)];
    if (!type) return c.notFound();
    let file: string;
    try {
      file = store.resolve(key);
    } catch {
      return c.notFound();
    }
    if (!fs.existsSync(file)) return c.notFound();
    return c.body(fs.readFileSync(file), 200, {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });
}

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
  const local = config.cos ? null : new LocalStore(path.join(config.dataDir, "objects"));
  const store: ObjectStore = config.cos ? new CosStore(config.cos) : local!;

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
  app.route("/api/me", meRoutes({ players, presets, results, registry, store }));
  app.route("/api/rooms", roomRoutes({ registry, players }));
  if (local) mountLocalObjects(app, local);
  app.notFound((c) => c.json({ error: "not_found", message: "接口不存在" }, 404));
  app.onError((err, c) => {
    console.error(`[http] ${c.req.method} ${c.req.path}`, err);
    return c.json({ error: "internal", message: "服务器内部错误" }, 500);
  });

  if (upgradeWebSocket) mountWebSocket(app, upgradeWebSocket, { registry, players });
  mountStatic(app, config.webDist);

  return { app, db, registry, players };
}
