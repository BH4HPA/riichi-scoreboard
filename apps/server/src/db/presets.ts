import { randomBytes } from "node:crypto";
import type { RoomRules, RulesPreset } from "@riichi/core";
import type { Database } from "./index";

export const MAX_PRESETS_PER_PLAYER = 20;

export class PresetsRepo {
  constructor(private readonly db: Database) {}

  list(playerId: string): RulesPreset[] {
    const rows = this.db
      .prepare("SELECT id, name, rules FROM presets WHERE player_id = ? ORDER BY created_at")
      .all(playerId) as Array<{ id: string; name: string; rules: string }>;
    return rows.map((r) => ({ id: r.id, name: r.name, rules: JSON.parse(r.rules) as RoomRules }));
  }

  count(playerId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM presets WHERE player_id = ?")
      .get(playerId) as { n: number };
    return row.n;
  }

  create(playerId: string, name: string, rules: RoomRules, now: number): RulesPreset {
    const id = randomBytes(8).toString("hex");
    this.db
      .prepare(
        "INSERT INTO presets (id, player_id, name, rules, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, playerId, name, JSON.stringify(rules), now);
    return { id, name, rules };
  }

  remove(playerId: string, id: string): boolean {
    const res = this.db
      .prepare("DELETE FROM presets WHERE id = ? AND player_id = ?")
      .run(id, playerId);
    return res.changes > 0;
  }
}
