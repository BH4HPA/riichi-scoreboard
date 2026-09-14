import { randomBytes } from "node:crypto";
import type { PlayerRef } from "@riichi/core";
import type { Database } from "./index";

export interface PlayerRow {
  id: string;
  token: string;
  name: string;
  avatar: string | null;
  created_at: number;
  last_seen: number;
}

export function toPlayerRef(row: PlayerRow): PlayerRef {
  return { id: row.id, name: row.name, avatar: row.avatar };
}

export class PlayersRepo {
  constructor(private readonly db: Database) {}

  create(name: string, now: number): PlayerRow {
    const row: PlayerRow = {
      id: randomBytes(8).toString("hex"),
      token: randomBytes(24).toString("hex"),
      name,
      avatar: null,
      created_at: now,
      last_seen: now,
    };
    this.db
      .prepare(
        "INSERT INTO players (id, token, name, avatar, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(row.id, row.token, row.name, row.avatar, row.created_at, row.last_seen);
    return row;
  }

  byToken(token: string): PlayerRow | null {
    return (
      (this.db.prepare("SELECT * FROM players WHERE token = ?").get(token) as
        PlayerRow | undefined) ?? null
    );
  }

  byId(id: string): PlayerRow | null {
    return (
      (this.db.prepare("SELECT * FROM players WHERE id = ?").get(id) as PlayerRow | undefined) ??
      null
    );
  }

  touch(id: string, now: number): void {
    this.db.prepare("UPDATE players SET last_seen = ? WHERE id = ?").run(now, id);
  }

  update(id: string, patch: { name?: string; avatar?: string | null }): PlayerRow {
    if (patch.name !== undefined)
      this.db.prepare("UPDATE players SET name = ? WHERE id = ?").run(patch.name, id);
    if (patch.avatar !== undefined)
      this.db.prepare("UPDATE players SET avatar = ? WHERE id = ?").run(patch.avatar, id);
    return this.byId(id)!;
  }
}
