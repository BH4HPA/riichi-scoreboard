import { describe, expect, it } from "vitest";
import {
  autoStartEligible,
  seatsOnline,
  STOPS_MUSIC,
  TOLERATES_STALE,
  toRoomView,
  validateEvaluateRequest,
  validateMusicTrack,
} from "./protocol";
import { DomainError } from "./progress/advance";
import { RulesError } from "./rules/validate";
import { MUSIC_TRACKS } from "./music";
import { createRoom } from "./reducer/reduce";
import { MLEAGUE_RULES } from "./rules/mleague";
import type { HandInput, PlayerRef, RoomState } from "./types/state";

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
    const music = { track: MUSIC_TRACKS[0]!.id, seat: 0 as const, at: 1 };
    const view = toRoomView(state, 3, new Set(["a"]), 1234, music);
    expect(view.online).toEqual([true, false, false, false]);
    expect(view.autoStartIn).toBe(1234);
    expect(view.music).toBe(music);
    expect(view.seq).toBe(3);
  });
});

describe("立直音乐", () => {
  it("validateMusicTrack：null 停止、曲库 id 通过、其余拒绝", () => {
    expect(validateMusicTrack(null)).toBeNull();
    expect(validateMusicTrack(MUSIC_TRACKS[1]!.id)).toBe(MUSIC_TRACKS[1]!.id);
    for (const bad of [undefined, 1, "", "nope", {}]) {
      expect(() => validateMusicTrack(bad)).toThrow(/曲目不存在/);
    }
  });
  it("STOPS_MUSIC：结算、进程类与 redo 停；座位类与 undo 不停", () => {
    expect(STOPS_MUSIC.tsumo).toBe(true);
    expect(STOPS_MUSIC.start).toBe(true);
    expect(STOPS_MUSIC.redo).toBe(true);
    expect(STOPS_MUSIC.undo).toBe(false);
    expect(STOPS_MUSIC.setReady).toBe(false);
  });
});

describe("并发提交", () => {
  // 表是 Record<ClientCommand["type"], boolean>，漏项由类型挡住；这里只钉住两类的分界
  it("TOLERATES_STALE：大厅里点得到的都豁免，改动这一局的都不豁免", () => {
    for (const t of ["sit", "sitLocal", "leave", "setReady", "start", "dissolve"] as const) {
      expect(TOLERATES_STALE[t]).toBe(true);
    }
    for (const t of ["ron", "tsumo", "undo", "redo", "adjust", "setRules", "toLobby"] as const) {
      expect(TOLERATES_STALE[t]).toBe(false);
    }
  });
});

describe("validateEvaluateRequest", () => {
  const hand: HandInput = {
    closed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 19, 19],
    melds: [],
    winTile: 19,
    tsumo: false,
    doraIndicators: [],
    uraIndicators: [],
    riichi: true,
    doubleRiichi: false,
    ippatsu: false,
    afterKan: false,
    lastTile: false,
    firstTake: false,
  };
  const ok = { hand, rules: MLEAGUE_RULES, roundWind: 1, seatWind: 0 };

  it("合法请求原样通过", () => {
    expect(validateEvaluateRequest(ok)).toEqual(ok);
  });
  it("风位越界 / 牌面坏 / 规则坏分别报错", () => {
    expect(() => validateEvaluateRequest({ ...ok, seatWind: 4 })).toThrow(DomainError);
    expect(() => validateEvaluateRequest({ ...ok, hand: { ...hand, closed: "x" } })).toThrow(
      DomainError,
    );
    expect(() =>
      validateEvaluateRequest({ ...ok, rules: { ...MLEAGUE_RULES, hand: null } }),
    ).toThrow(RulesError);
    expect(() => validateEvaluateRequest(null)).toThrow(DomainError);
  });
});
