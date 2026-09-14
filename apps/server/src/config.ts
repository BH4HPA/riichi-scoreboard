import path from "node:path";

export interface ServerConfig {
  port: number;
  host: string;
  /** SQLite 与头像所在目录 */
  dataDir: string;
  /** 前端构建产物目录；不存在则不托管静态文件 */
  webDist: string;
  /** 允许的跨域来源；为空则只服务同源 */
  corsOrigins: string[];
  /** 房间闲置多久后从内存卸载（毫秒） */
  roomIdleMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const root = path.resolve(import.meta.dirname, "..");
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? "0.0.0.0",
    dataDir: path.resolve(env.DATA_DIR ?? path.join(root, "data")),
    webDist: path.resolve(env.WEB_DIST ?? path.join(root, "..", "web", "dist")),
    corsOrigins: (env.CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    roomIdleMs: Number(env.ROOM_IDLE_MS ?? 60 * 60 * 1000),
  };
}
