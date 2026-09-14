import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 1;

const SCHEMA = `
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
`;

export type Database = DatabaseSync;

export function openDatabase(file: string | ":memory:"): Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (row.user_version < SCHEMA_VERSION) {
    db.exec(SCHEMA);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  return db;
}
