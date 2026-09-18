import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * 按 user_version 逐版迁移：新库从 0 依次执行全部脚本，旧库只执行缺失的版本。
 * 每个版本在一个事务里执行；写新版本时只追加，不改旧脚本。
 */
export const MIGRATIONS: readonly string[] = [
  // v1：初始结构
  `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  rules TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS room_events (
  room_code TEXT NOT NULL,
  seq INTEGER NOT NULL,
  at INTEGER NOT NULL,
  actor_player TEXT,
  actor_client TEXT NOT NULL,
  command TEXT NOT NULL,
  PRIMARY KEY (room_code, seq)
);
CREATE TABLE IF NOT EXISTS game_results (
  room_code TEXT NOT NULL,
  game_no INTEGER NOT NULL,
  seat INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  finished_at INTEGER NOT NULL,
  points INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  score REAL NOT NULL,
  PRIMARY KEY (room_code, game_no, seat)
);
CREATE INDEX IF NOT EXISTS idx_game_results_player ON game_results (player_id, finished_at DESC);
CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  rules TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presets_player ON presets (player_id, created_at);
`,
  // v2：本地玩家（token 可空、kind、created_by）、头像对象 key、房间解散时间。
  // v1 的头像文件与新的对象存储布局不兼容，头像字段清空，玩家重新上传即可。
  `
CREATE TABLE players_v2 (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE,
  name TEXT NOT NULL,
  avatar TEXT,
  avatar_key TEXT,
  kind TEXT NOT NULL DEFAULT 'device',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
INSERT INTO players_v2 (id, token, name, avatar, avatar_key, kind, created_by, created_at, last_seen)
  SELECT id, token, name, NULL, NULL, 'device', NULL, created_at, last_seen FROM players;
DROP TABLE players;
ALTER TABLE players_v2 RENAME TO players;
CREATE INDEX idx_players_created_by ON players (created_by, created_at);
ALTER TABLE rooms ADD COLUMN closed_at INTEGER;
`,
  // v3：拍照识别记录（照片对象 key、检测框、识别结果、用户最终确认的手牌），作训练数据。
  `
CREATE TABLE recognitions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  photo_key TEXT NOT NULL,
  model_id TEXT NOT NULL,
  engine TEXT,
  ms INTEGER,
  detections TEXT,
  recognized TEXT,
  corrected TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_recognitions_player ON recognitions (player_id, created_at);
`,
  // v4：只剩手机浏览器一种推理引擎，engine 列没有信息量
  `ALTER TABLE recognitions DROP COLUMN engine;`,
  // v5：区分记录来源（房间结算 / 标注模式）。历史记录都来自房间，默认值正好。
  // 照 players.kind 的先例用 TEXT + DEFAULT，取值由 core 的联合类型约束，不加 CHECK。
  `ALTER TABLE recognitions ADD COLUMN source TEXT NOT NULL DEFAULT 'room';`,
];

export type Database = DatabaseSync;

export function schemaVersion(db: Database): number {
  return (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
}

export function openDatabase(file: string | ":memory:"): Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

export function migrate(db: Database): void {
  for (let version = schemaVersion(db); version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
