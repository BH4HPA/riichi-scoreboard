import type { Command, RoomEvent, RoomRules } from "@riichi/core";
import type { Database } from "./index";

export interface RoomRow {
  code: string;
  rules: RoomRules;
  created_at: number;
  updated_at: number;
}

export class RoomsRepo {
  constructor(private readonly db: Database) {}

  create(code: string, rules: RoomRules, now: number): void {
    this.db
      .prepare("INSERT INTO rooms (code, rules, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(code, JSON.stringify(rules), now, now);
  }

  get(code: string): RoomRow | null {
    const row = this.db.prepare("SELECT * FROM rooms WHERE code = ?").get(code) as
      { code: string; rules: string; created_at: number; updated_at: number } | undefined;
    return row ? { ...row, rules: JSON.parse(row.rules) as RoomRules } : null;
  }

  exists(code: string): boolean {
    return this.db.prepare("SELECT 1 FROM rooms WHERE code = ?").get(code) !== undefined;
  }

  events(code: string): RoomEvent[] {
    const rows = this.db
      .prepare(
        "SELECT seq, at, actor_player, actor_client, command FROM room_events WHERE room_code = ? ORDER BY seq",
      )
      .all(code) as Array<{
      seq: number;
      at: number;
      actor_player: string | null;
      actor_client: string;
      command: string;
    }>;
    return rows.map((r) => ({
      seq: r.seq,
      at: r.at,
      actor: { playerId: r.actor_player, clientId: r.actor_client },
      command: JSON.parse(r.command) as Command,
    }));
  }

  appendEvent(code: string, event: RoomEvent): void {
    this.db
      .prepare(
        "INSERT INTO room_events (room_code, seq, at, actor_player, actor_client, command) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        code,
        event.seq,
        event.at,
        event.actor.playerId,
        event.actor.clientId,
        JSON.stringify(event.command),
      );
    this.db.prepare("UPDATE rooms SET updated_at = ? WHERE code = ?").run(event.at, code);
  }
}
