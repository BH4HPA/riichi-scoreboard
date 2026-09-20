import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { UpgradeWebSocket } from "hono/ws";
import { RECOGNITION_MANIFEST } from "@riichi/core";
import type { ServerConfig } from "./config";
import { openDatabase, type Database } from "./db";
import { PlayersRepo } from "./db/players";
import { PresetsRepo } from "./db/presets";
import { RecognitionsRepo } from "./db/recognitions";
import { RecognitionSessionsRepo } from "./db/recognitionSessions";
import { ResultsRepo } from "./db/results";
import { RoomsRepo } from "./db/rooms";
import { evaluateRoutes } from "./http/routes/evaluate";
import { localRoutes } from "./http/routes/locals";
import { meRoutes } from "./http/routes/me";
import { recognitionRoutes } from "./http/routes/recognitions";
import { recognitionSessionRoutes } from "./http/routes/recognitionSessions";
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
  /** 测试用：缩短 WebSocket 空闲断开与自动开局倒计时 */
  timings?: { wsIdleMs?: number; autoStartMs?: number };
  /** 测试时关闭请求日志 */
  quiet?: boolean;
  /** 测试用：覆盖当前发布的模型 id（默认取 core manifest） */
  modelId?: string | null;
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
  timings,
  quiet = false,
  modelId = RECOGNITION_MANIFEST.model?.id ?? null,
}: CreateAppOptions): AppContext {
  const db = openDatabase(dbFile ?? path.join(config.dataDir, "riichi.sqlite"));
  const players = new PlayersRepo(db);
  const rooms = new RoomsRepo(db);
  const results = new ResultsRepo(db);
  const presets = new PresetsRepo(db);
  const recognitions = new RecognitionsRepo(db);
  const sessions = new RecognitionSessionsRepo(db);
  const registry = new RoomRegistry(rooms, results, players, Date.now, timings?.autoStartMs);
  const local = config.cos ? null : new LocalStore(path.join(config.dataDir, "objects"));
  const store: ObjectStore = config.cos ? new CosStore(config.cos) : local!;

  const app = new Hono();
  if (!quiet) app.use("/api/*", logger());
  // 线上经 CDN 回源：接口响应一律禁止缓存，否则带 token 的 /api/me 会串号
  const noStore = createMiddleware(async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });
  app.use("/api/*", noStore);
  app.use("/health", noStore);
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
  app.route("/api/me/locals", localRoutes({ players, results, registry, store }));
  app.route(
    "/api/me",
    meRoutes({ players, presets, results, registry, store, trustProxy: config.trustProxy }),
  );
  app.route("/api/rooms", roomRoutes({ registry, players }));
  app.route("/api/evaluate", evaluateRoutes({ players }));
  app.route("/api/recognitions", recognitionRoutes({ players, recognitions, store, modelId }));
  app.route("/api/recognition-sessions", recognitionSessionRoutes({ players, sessions }));
  if (local) mountLocalObjects(app, local);
  app.notFound((c) => c.json({ error: "not_found", message: "接口不存在" }, 404));
  app.onError((err, c) => {
    // bodyLimit 等中间件用 HTTPException 表达 413 之类的状态，原样透传
    if (err instanceof HTTPException) return err.getResponse();
    console.error(`[http] ${c.req.method} ${c.req.path}`, err);
    return c.json({ error: "internal", message: "服务器内部错误" }, 500);
  });

  if (upgradeWebSocket) {
    mountWebSocket(app, upgradeWebSocket, { registry, players, idleMs: timings?.wsIdleMs });
  }
  // 拆分托管（前端在别的域名）时不托管静态产物；CORS 白名单第一项就是前端站点，误入者 302 过去
  mountStatic(app, { webDist: config.webDist, redirectTo: config.corsOrigins[0] ?? null });

  return { app, db, registry, players };
}
