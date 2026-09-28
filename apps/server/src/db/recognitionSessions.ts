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

  /**
   * id 用手机端给的（采样帧与定格记录都按它串联），旧前端不给时现生成。
   * 同一 id 已存在就什么都不做：摘要发出后页面卸载、keepalive 重发都可能再来一次，先到的为准。
   * 不比对归属——id 是 64 位随机数，撞上别人的只能是故意的，而先到的那行不会被改写。
   */
  create(playerId: string, summary: RecognitionSessionSummary, now: number): string {
    const id = summary.id ?? randomBytes(8).toString("hex");
    this.db
      .prepare(
        "INSERT INTO recognition_sessions (id, player_id, source, outcome, summary, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
      )
      .run(id, playerId, summary.source, summary.outcome, JSON.stringify(summary), now);
    return id;
  }
}
