import { randomBytes } from "node:crypto";
import type { RecognitionSessionSummary } from "@riichi/core";
import type { Database } from "./index";

export interface RecognitionSessionRow {
  id: string;
  player_id: string;
  source: RecognitionSessionSummary["source"];
  outcome: RecognitionSessionSummary["outcome"];
  summary: string;
  created_at: number;
}

/** 取景会话摘要：一次打开取景页一行，只增不改。摘要整体存 JSON。 */
export class RecognitionSessionsRepo {
  constructor(private readonly db: Database) {}

  create(playerId: string, summary: RecognitionSessionSummary, now: number): string {
    const id = randomBytes(8).toString("hex");
    this.db
      .prepare(
        "INSERT INTO recognition_sessions (id, player_id, source, outcome, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, playerId, summary.source, summary.outcome, JSON.stringify(summary), now);
    return id;
  }
}
