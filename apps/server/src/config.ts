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

function intEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0)
    throw new Error(`环境变量 ${key} 必须是非负整数，当前为 "${raw}"`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const root = path.resolve(import.meta.dirname, "..");
  return {
    port: intEnv(env, "PORT", 8787),
    host: env.HOST ?? "0.0.0.0",
    dataDir: path.resolve(env.DATA_DIR ?? path.join(root, "data")),
    webDist: path.resolve(env.WEB_DIST ?? path.join(root, "..", "web", "dist")),
    corsOrigins: (env.CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    roomIdleMs: intEnv(env, "ROOM_IDLE_MS", 60 * 60 * 1000),
  };
}
