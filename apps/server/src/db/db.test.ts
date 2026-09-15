import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS, migrate, schemaVersion } from "./index";
import { PlayersRepo } from "./players";

describe("数据库迁移", () => {
  it("新库直接迁到最新版本", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    migrate(db); // 幂等
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
  });

  it("v1 库升级到 v2：玩家保留、token 保留、kind=device、头像清空；rooms 增加 closed_at", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(MIGRATIONS[0]!);
    db.exec("PRAGMA user_version = 1");
    db.prepare(
      "INSERT INTO players (id, token, name, avatar, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("p1", "tok", "老玩家", "/api/avatars/p1.jpg?v=1", 1, 2);
    db.prepare("INSERT INTO rooms (code, rules, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      "ABCDEF",
      "{}",
      1,
      1,
    );
    migrate(db);
    expect(schemaVersion(db)).toBe(2);
    const players = new PlayersRepo(db);
    const row = players.byToken("tok");
    expect(row).toMatchObject({ id: "p1", name: "老玩家", kind: "device", avatar: null });
    expect(players.byId("p1")?.created_by).toBeNull();
    expect(db.prepare("SELECT closed_at FROM rooms WHERE code = 'ABCDEF'").get()).toEqual({
      closed_at: null,
    });
    // 本地玩家：无 token，按创建者列出
    const local = players.createLocal("小明", "p1", 3);
    expect(local.token).toBeNull();
    expect(players.localsOf("p1").map((p) => p.id)).toEqual([local.id]);
    expect(players.byToken("")).toBeNull();
  });
});
