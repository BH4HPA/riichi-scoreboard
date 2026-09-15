import { randomBytes } from "node:crypto";
import type { PlayerKind, PlayerRef } from "@riichi/core";
import type { Database } from "./index";

export interface PlayerRow {
  id: string;
  /** 设备玩家的登录 token；本地玩家为 null（不可登录） */
  token: string | null;
  name: string;
  avatar: string | null;
  /** 对象存储中的头像 key（删除/替换用） */
  avatar_key: string | null;
  kind: PlayerKind;
  /** 本地玩家的创建者（主控台设备玩家 id） */
  created_by: string | null;
  created_at: number;
  last_seen: number;
}

export function toPlayerRef(row: PlayerRow): PlayerRef {
  return { id: row.id, name: row.name, avatar: row.avatar, kind: row.kind };
}

const COLUMNS = "id, token, name, avatar, avatar_key, kind, created_by, created_at, last_seen";

export class PlayersRepo {
  constructor(private readonly db: Database) {}

  /** 设备玩家：签发 token。 */
  create(name: string, now: number): PlayerRow {
    return this.insert({
      id: randomBytes(8).toString("hex"),
      token: randomBytes(24).toString("hex"),
      name,
      avatar: null,
      avatar_key: null,
      kind: "device",
      created_by: null,
      created_at: now,
      last_seen: now,
    });
  }

  /** 本地玩家：无 token，归属创建它的设备玩家。 */
  createLocal(name: string, createdBy: string, now: number): PlayerRow {
    return this.insert({
      id: randomBytes(8).toString("hex"),
      token: null,
      name,
      avatar: null,
      avatar_key: null,
      kind: "local",
      created_by: createdBy,
      created_at: now,
      last_seen: now,
    });
  }

  private insert(row: PlayerRow): PlayerRow {
    this.db
      .prepare(`INSERT INTO players (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        row.id,
        row.token,
        row.name,
        row.avatar,
        row.avatar_key,
        row.kind,
        row.created_by,
        row.created_at,
        row.last_seen,
      );
    return row;
  }

  byToken(token: string): PlayerRow | null {
    return (
      (this.db.prepare(`SELECT ${COLUMNS} FROM players WHERE token = ?`).get(token) as
        PlayerRow | undefined) ?? null
    );
  }

  byId(id: string): PlayerRow | null {
    return (
      (this.db.prepare(`SELECT ${COLUMNS} FROM players WHERE id = ?`).get(id) as
        PlayerRow | undefined) ?? null
    );
  }

  /** 某设备创建的本地玩家，按创建时间。 */
  localsOf(createdBy: string): PlayerRow[] {
    return this.db
      .prepare(
        `SELECT ${COLUMNS} FROM players WHERE kind = 'local' AND created_by = ? ORDER BY created_at`,
      )
      .all(createdBy) as unknown as PlayerRow[];
  }

  touch(id: string, now: number): void {
    this.db.prepare("UPDATE players SET last_seen = ? WHERE id = ?").run(now, id);
  }

  update(
    id: string,
    patch: { name?: string; avatar?: string | null; avatarKey?: string | null },
  ): PlayerRow {
    if (patch.name !== undefined)
      this.db.prepare("UPDATE players SET name = ? WHERE id = ?").run(patch.name, id);
    if (patch.avatar !== undefined)
      this.db.prepare("UPDATE players SET avatar = ? WHERE id = ?").run(patch.avatar, id);
    if (patch.avatarKey !== undefined)
      this.db.prepare("UPDATE players SET avatar_key = ? WHERE id = ?").run(patch.avatarKey, id);
    return this.byId(id)!;
  }

  remove(id: string): boolean {
    return this.db.prepare("DELETE FROM players WHERE id = ?").run(id).changes > 0;
  }
}
