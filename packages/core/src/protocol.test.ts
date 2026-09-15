import { describe, expect, it } from "vitest";
import { autoStartEligible, seatsOnline, toRoomView } from "./protocol";
import { createRoom } from "./reducer/reduce";
import { MLEAGUE_RULES } from "./rules/mleague";
import type { PlayerRef, RoomState } from "./types/state";

const device = (id: string): PlayerRef => ({ id, name: id, avatar: null, kind: "device" });
const local = (id: string): PlayerRef => ({ id, name: id, avatar: null, kind: "local" });

function lobby(seats: (PlayerRef | null)[], ready = [true, true, true, true]): RoomState {
  return { ...createRoom("X", MLEAGUE_RULES), seats, ready };
}

describe("seatsOnline", () => {
  it("空座 false、本地玩家恒为 true、设备玩家看连接", () => {
    const state = lobby([device("a"), local("l"), null, device("d")]);
    expect(seatsOnline(state, new Set(["a"]))).toEqual([true, true, false, false]);
  });
});

describe("autoStartEligible", () => {
  const four = [device("a"), device("b"), local("c"), local("d")];
  const all = new Set(["a", "b"]);
  it("满座、全准备、设备玩家全在线、至少一名设备玩家 → 开", () => {
    const state = lobby(four);
    expect(autoStartEligible(state, seatsOnline(state, all))).toBe(true);
  });
  it("缺人 / 未准备 / 有人离线 / 全本地 / 不在大厅 → 不开", () => {
    const missing = lobby([device("a"), device("b"), local("c"), null]);
    expect(autoStartEligible(missing, seatsOnline(missing, all))).toBe(false);
    const notReady = lobby(four, [true, false, true, true]);
    expect(autoStartEligible(notReady, seatsOnline(notReady, all))).toBe(false);
    const offline = lobby(four);
    expect(autoStartEligible(offline, seatsOnline(offline, new Set(["a"])))).toBe(false);
    const allLocal = lobby([local("a"), local("b"), local("c"), local("d")]);
    expect(autoStartEligible(allLocal, seatsOnline(allLocal, new Set()))).toBe(false);
    const playing = { ...lobby(four), phase: "playing" as const };
    expect(autoStartEligible(playing, seatsOnline(playing, all))).toBe(false);
  });
});

describe("toRoomView", () => {
  it("带在线状态与自动开局剩余时间", () => {
    const state = lobby([device("a"), null, null, null], [false, false, false, false]);
    const view = toRoomView(state, 3, new Set(["a"]), 1234);
    expect(view.online).toEqual([true, false, false, false]);
    expect(view.autoStartIn).toBe(1234);
    expect(view.seq).toBe(3);
  });
});
