import { randomBytes } from "node:crypto";
import type { RecognitionSampleMeta } from "@riichi/core";
import type { Database } from "./index";

export interface RecognitionSampleRow {
  id: string;
  session_id: string;
  player_id: string;
  seq: number;
  photo_key: string;
  meta: string;
  created_at: number;
}

/** 取景会话的采样帧：一帧一行，只增不改。元数据整体存 JSON。 */
export class RecognitionSamplesRepo {
  constructor(private readonly db: Database) {}

  /** 这一帧已经落过库（同一会话同一序号）就不必再存照片 */
  has(sessionId: string, seq: number): boolean {
    return (
      this.db
        .prepare("SELECT 1 FROM recognition_samples WHERE session_id = ? AND seq = ?")
        .get(sessionId, seq) !== undefined
    );
  }

  /** 同一 (session_id, seq) 已存在时不写，返回 false（并发重传时后到的那次）。 */
  create(
    sessionId: string,
    seq: number,
    playerId: string,
    photoKey: string,
    meta: RecognitionSampleMeta,
    now: number,
  ): boolean {
    const res = this.db
      .prepare(
        "INSERT INTO recognition_samples (id, session_id, player_id, seq, photo_key, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (session_id, seq) DO NOTHING",
      )
      .run(
        randomBytes(8).toString("hex"),
        sessionId,
        playerId,
        seq,
        photoKey,
        JSON.stringify(meta),
        now,
      );
    return res.changes > 0;
  }
}
