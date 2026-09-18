import { create } from "zustand";
import type { RoomView, UiState } from "@riichi/core";

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";
export type ClosedReason = "not_found" | "dissolved" | "unauthorized" | "offline";

export interface RoomStore {
  status: ConnectionStatus;
  room: RoomView | null;
  intents: UiState[];
  playerId: string | null;
  /** 自动开局的本地截止时刻（收到状态时用 autoStartIn 换算，不受手机时钟偏差影响）；null = 未在倒计时 */
  autoStartDeadline: number | null;
  /** 连接终止的原因：服务端拒绝（房间不存在 / 已解散 / 身份失效）或根本没连上（offline）；正常断线重连时为 null */
  closedReason: ClosedReason | null;
  /** 最近一次错误提示（会被新消息覆盖） */
  notice: { tone: "error" | "info"; text: string; at: number } | null;
  set(partial: Partial<RoomStore>): void;
  notify(tone: "error" | "info", text: string): void;
}

export const useRoomStore = create<RoomStore>()((set) => ({
  status: "idle",
  room: null,
  intents: [],
  playerId: null,
  autoStartDeadline: null,
  closedReason: null,
  notice: null,
  set: (partial) => set(partial),
  notify: (tone, text) => set({ notice: { tone, text, at: Date.now() } }),
}));
