import { randomBytes } from "node:crypto";
import type { RecognitionPatch } from "@riichi/core";
import type { Database } from "./index";

export interface RecognitionRow {
  id: string;
  player_id: string;
  photo_key: string;
  model_id: string;
  ms: number | null;
  detections: string | null;
  recognized: string | null;
  corrected: string | null;
  created_at: number;
  updated_at: number;
}

/** 识别记录：一次拍照一行。JSON 列在这里序列化；归属校验并入 WHERE。 */
export class RecognitionsRepo {
  constructor(private readonly db: Database) {}

  create(playerId: string, photoKey: string, modelId: string, now: number): string {
    const id = randomBytes(8).toString("hex");
    this.db
      .prepare(
        "INSERT INTO recognitions (id, player_id, photo_key, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, playerId, photoKey, modelId, now, now);
    return id;
  }

  /** 只更新给出的字段；不是本人的记录视为不存在。 */
  patch(id: string, playerId: string, patch: RecognitionPatch, now: number): boolean {
    const sets: string[] = [];
    const args: unknown[] = [];
    const set = (column: string, value: unknown) => {
      sets.push(`${column} = ?`);
      args.push(value);
    };
    if (patch.modelId !== undefined) set("model_id", patch.modelId);
    if (patch.ms !== undefined) set("ms", patch.ms);
    if (patch.detections !== undefined) set("detections", JSON.stringify(patch.detections));
    if (patch.recognized !== undefined) set("recognized", JSON.stringify(patch.recognized));
    if (patch.corrected !== undefined) set("corrected", JSON.stringify(patch.corrected));
    if (sets.length === 0) return false;
    sets.push("updated_at = ?");
    args.push(now, id, playerId);
    const res = this.db
      .prepare(`UPDATE recognitions SET ${sets.join(", ")} WHERE id = ? AND player_id = ?`)
      .run(...(args as [string]));
    return res.changes > 0;
  }
}
