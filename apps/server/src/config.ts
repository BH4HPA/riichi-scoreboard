import path from "node:path";
import type { CosConfig } from "./storage/cos";

export interface ServerConfig {
  port: number;
  host: string;
  /** SQLite 与本地对象文件所在目录 */
  dataDir: string;
  /** 前端构建产物目录；null（WEB_DIST 留空）或目录不存在则不托管静态文件 */
  webDist: string | null;
  /** 允许的跨域来源；为空则只服务同源 */
  corsOrigins: string[];
  /** 房间闲置多久后从内存卸载（毫秒） */
  roomIdleMs: number;
  /** 腾讯云 COS；null 表示用本地磁盘 */
  cos: CosConfig | null;
}

function intEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0)
    throw new Error(`环境变量 ${key} 必须是非负整数，当前为 "${raw}"`);
  return n;
}

const COS_REQUIRED = [
  "QCLOUD_SECRET_ID",
  "QCLOUD_SECRET_KEY",
  "QCLOUD_COS_BUCKET",
  "QCLOUD_COS_REGION",
  "QCLOUD_COS_CDN_DOMAIN",
] as const;

/** 五个核心变量全给 → COS；全空 → 本地；只给一部分视为配置错误。 */
function cosEnv(env: NodeJS.ProcessEnv): CosConfig | null {
  const given = COS_REQUIRED.filter((k) => (env[k] ?? "") !== "");
  if (given.length === 0) return null;
  if (given.length !== COS_REQUIRED.length) {
    const missing = COS_REQUIRED.filter((k) => !given.includes(k)).join(", ");
    throw new Error(`COS 配置不完整，缺少：${missing}`);
  }
  return {
    secretId: env.QCLOUD_SECRET_ID!,
    secretKey: env.QCLOUD_SECRET_KEY!,
    bucket: env.QCLOUD_COS_BUCKET!,
    region: env.QCLOUD_COS_REGION!,
    endpoint: env.QCLOUD_COS_ENDPOINT || null,
    cdnDomain: env.QCLOUD_COS_CDN_DOMAIN!,
    keyPrefix: env.COS_KEY_PREFIX ?? "riichi/",
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const root = path.resolve(import.meta.dirname, "..");
  return {
    port: intEnv(env, "PORT", 8787),
    host: env.HOST ?? "0.0.0.0",
    dataDir: path.resolve(env.DATA_DIR ?? path.join(root, "data")),
    webDist:
      env.WEB_DIST === ""
        ? null
        : path.resolve(env.WEB_DIST ?? path.join(root, "..", "web", "dist")),
    corsOrigins: (env.CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    roomIdleMs: intEnv(env, "ROOM_IDLE_MS", 60 * 60 * 1000),
    cos: cosEnv(env),
  };
}
