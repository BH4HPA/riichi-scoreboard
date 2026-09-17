import { describe, expect, it } from "vitest";
import { MLEAGUE_RULES } from "../rules/mleague";
import { createRoom, reduceRoom, replay } from "../reducer/reduce";
import type { Command } from "../types/commands";
import type { PlayerRef, RoomState } from "../types/state";
import { describeRevert } from "./describeRevert";

const players: PlayerRef[] = ["阿东", "阿南", "阿西", "阿北"].map((name, i) => ({
  id: String(i),
  name,
  avatar: null,
  kind: "device",
}));

let seq = 0;
function apply(room: RoomState, command: Command): RoomState {
  seq += 1;
  return reduceRoom(room, { seq, at: seq, actor: { playerId: null, clientId: "t" }, command });
}

function started(): RoomState {
  const cmds: Command[] = [
    ...players.map((player, s): Command => ({ type: "sit", seat: s as 0, player })),
    { type: "start", force: true },
  ];
  return replay(
    createRoom("X", MLEAGUE_RULES),
    cmds.map((command, i) => ({
      seq: i + 1,
      at: i,
      actor: { playerId: null, clientId: "t" },
      command,
    })),
  );
}

const manual = (han: number, fu: number) => ({ kind: "manual" as const, han, fu, yakuman: 0 });
const present = (room: RoomState) => room.game!.present;

describe("describeRevert", () => {
  it("撤销一笔荣和：局名 + 和牌者 + 类型", () => {
    const before = apply(started(), {
      type: "ron",
      loser: 0,
      wins: [{ winner: 3, value: manual(2, 30) }],
      riichi: [],
    });
    const after = apply(before, { type: "undo" });
    expect(describeRevert(present(before), present(after))).toBe("东1局0本场 阿北荣和");
    const redone = apply(after, { type: "redo" });
    expect(describeRevert(present(after), present(redone))).toBe("东1局0本场 阿北荣和");
  });

  it("撤销带残留供托的终局：供托分配条目不算，写「终局结算」", () => {
    let room = started();
    room = apply(room, {
      type: "draw",
      tenpai: [false, false, false, false],
      riichi: [1],
      nagashi: [],
    });
    const before = apply(room, { type: "endGame" });
    expect(present(before).history[0]!.kind).toBe("kyotaku");
    const after = apply(before, { type: "undo" });
    expect(describeRevert(present(before), present(after))).toBe("终局结算");
  });

  it("无供托的终局：没有条目变化，写「终局结算」", () => {
    const before = apply(started(), { type: "endGame" });
    const after = apply(before, { type: "undo" });
    expect(describeRevert(present(before), present(after))).toBe("终局结算");
  });

  it("调整场况", () => {
    const before = apply(started(), { type: "adjust", kyoku: 2, honba: 1 });
    const after = apply(before, { type: "undo" });
    expect(describeRevert(present(before), present(after))).toBe("东1局0本场 调整");
  });
});
