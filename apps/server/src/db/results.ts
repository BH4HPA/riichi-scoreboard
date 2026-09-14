import type { PlayerStats, RoomState } from "@riichi/core";
import type { Database } from "./index";

interface ResultRow {
  room_code: string;
  game_no: number;
  finished_at: number;
  points: number;
  rank: number;
  score: number;
}

export class ResultsRepo {
  constructor(private readonly db: Database) {}

  /**
   * 只在对局状态跃迁时写库：playing→finished 写入（按开局时的玩家快照），
   * finished→playing（撤销终局/调整场况）删除。其它事件不触碰战绩。
   */
  onTransition(prev: RoomState, next: RoomState): void {
    const sameGame = prev.gameNo === next.gameNo;
    const wasFinished = sameGame && prev.game?.present.status === "finished";
    const isFinished = next.game?.present.status === "finished";
    if (isFinished && !wasFinished) this.record(next);
    else if (wasFinished && !isFinished && next.game) this.remove(next.code, next.gameNo);
  }

  private record(room: RoomState): void {
    const game = room.game!.present;
    if (!game.final) return;
    this.remove(room.code, room.gameNo);
    const insert = this.db.prepare(
      "INSERT INTO game_results (room_code, game_no, seat, player_id, finished_at, points, rank, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    game.players.forEach((player, seat) => {
      insert.run(
        room.code,
        room.gameNo,
        seat,
        player.id,
        game.finishedAt ?? 0,
        game.final!.points[seat]!,
        game.final!.ranks[seat]!,
        game.final!.scores[seat]!,
      );
    });
  }

  private remove(roomCode: string, gameNo: number): void {
    this.db
      .prepare("DELETE FROM game_results WHERE room_code = ? AND game_no = ?")
      .run(roomCode, gameNo);
  }

  statsFor(playerId: string, recentLimit = 20): PlayerStats {
    const rows = this.db
      .prepare(
        "SELECT room_code, game_no, finished_at, points, rank, score FROM game_results WHERE player_id = ? ORDER BY finished_at DESC",
      )
      .all(playerId) as unknown as ResultRow[];
    const rankCounts: [number, number, number, number] = [0, 0, 0, 0];
    let rankSum = 0;
    let totalScore = 0;
    for (const r of rows) {
      const bucket = (Math.min(Math.max(r.rank, 1), 4) - 1) as 0 | 1 | 2 | 3;
      rankCounts[bucket] += 1;
      rankSum += r.rank;
      totalScore += r.score;
    }
    return {
      games: rows.length,
      averageRank: rows.length ? Math.round((rankSum / rows.length) * 100) / 100 : null,
      totalScore: Math.round(totalScore * 10) / 10,
      rankCounts,
      recent: rows.slice(0, recentLimit).map((r) => ({
        roomCode: r.room_code,
        gameNo: r.game_no,
        finishedAt: r.finished_at,
        points: r.points,
        rank: r.rank,
        score: r.score,
      })),
    };
  }
}
