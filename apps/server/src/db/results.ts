import type { RoomState } from "@riichi/core";
import type { Database } from "./index";

export interface ResultRow {
  room_code: string;
  game_no: number;
  seat: number;
  player_id: string;
  finished_at: number;
  points: number;
  rank: number;
  score: number;
}

export interface PlayerStats {
  games: number;
  averageRank: number | null;
  totalScore: number;
  rankCounts: [number, number, number, number];
  recent: ResultRow[];
}

export class ResultsRepo {
  constructor(private readonly db: Database) {}

  /** 让 game_results 与房间当前状态一致：已终局则写入，否则删除该局记录（撤销终局的情况）。 */
  sync(room: RoomState): void {
    const del = this.db.prepare("DELETE FROM game_results WHERE room_code = ? AND game_no = ?");
    const game = room.game?.present;
    if (!game || game.status !== "finished" || !game.final) {
      del.run(room.code, room.gameNo);
      return;
    }
    del.run(room.code, room.gameNo);
    const insert = this.db.prepare(
      "INSERT INTO game_results (room_code, game_no, seat, player_id, finished_at, points, rank, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    room.seats.forEach((player, seat) => {
      if (!player) return;
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

  statsFor(playerId: string, recentLimit = 20): PlayerStats {
    const rows = this.db
      .prepare("SELECT * FROM game_results WHERE player_id = ? ORDER BY finished_at DESC")
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
      recent: rows.slice(0, recentLimit),
    };
  }
}
