import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS, migrate, schemaVersion } from "./index";
import { PlayersRepo } from "./players";
import { RecognitionsRepo, type RecognitionRow } from "./recognitions";

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
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
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

  it("v3 库里已有识别记录 → v4 删 engine 列后行仍在", () => {
    const db = new DatabaseSync(":memory:");
    for (const m of MIGRATIONS.slice(0, 3)) db.exec(m);
    db.exec("PRAGMA user_version = 3");
    db.prepare(
      "INSERT INTO recognitions (id, player_id, photo_key, model_id, engine, created_at, updated_at) VALUES ('r1', 'p1', 'k', 'm', 'browser', 1, 1)",
    ).run();
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    const row = db.prepare("SELECT * FROM recognitions WHERE id = 'r1'").get()!;
    expect(row).toMatchObject({ player_id: "p1", model_id: "m" });
    expect(row).not.toHaveProperty("engine");
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_recognitions_player'").get(),
    ).toBeTruthy();
  });

  it("v4 库里已有识别记录 → v5 补 source 列，历史行落到 room", () => {
    const db = new DatabaseSync(":memory:");
    for (const m of MIGRATIONS.slice(0, 4)) db.exec(m);
    db.exec("PRAGMA user_version = 4");
    db.prepare(
      "INSERT INTO recognitions (id, player_id, photo_key, model_id, created_at, updated_at) VALUES ('r2', 'p1', 'k', 'm', 1, 1)",
    ).run();
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(db.prepare("SELECT * FROM recognitions WHERE id = 'r2'").get()).toMatchObject({
      player_id: "p1",
      source: "room",
    });
  });

  it("识别记录表：JSON 列往返，归属校验，来源按写入保留", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const repo = new RecognitionsRepo(db);
    const id = repo.create("p1", "hands/p1/x.jpg", "model-1", "room", 100);
    const labelled = repo.create("p1", "hands/p1/y.jpg", "model-1", "label", 100);
    const get = () =>
      db.prepare("SELECT * FROM recognitions WHERE id = ?").get(id) as unknown as RecognitionRow;
    expect(get()).toMatchObject({ player_id: "p1", ms: null, detections: null, source: "room" });
    expect(db.prepare("SELECT source FROM recognitions WHERE id = ?").get(labelled)).toMatchObject({
      source: "label",
    });
    expect(get()).not.toHaveProperty("engine");
    const detections = [
      { cls: 3, conf: 0.9, box: [1, 2, 3, 4] as [number, number, number, number] },
    ];
    expect(repo.patch(id, "p1", { ms: 812, detections }, 200)).toBe(true);
    expect(repo.patch(id, "someone-else", { ms: 1 }, 300)).toBe(false);
    const row = get();
    expect(row.ms).toBe(812);
    expect(JSON.parse(row.detections!)).toEqual(detections);
    expect(row.updated_at).toBe(200);
    expect(repo.patch(id, "p1", {}, 400)).toBe(false);
  });

  it("v5 库升级到 v6：识别记录原样保留，多出取景会话表", () => {
    const db = new DatabaseSync(":memory:");
    for (const sql of MIGRATIONS.slice(0, 5)) db.exec(sql);
    db.exec("PRAGMA user_version = 5");
    const id = new RecognitionsRepo(db).create("p1", "hands/p1/a.jpg", "m", "calc", 1);
    migrate(db);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(db.prepare("SELECT source FROM recognitions WHERE id = ?").get(id)).toEqual({
      source: "calc",
    });
    expect(db.prepare("SELECT COUNT(*) AS n FROM recognition_sessions").get()).toEqual({ n: 0 });
  });
});
