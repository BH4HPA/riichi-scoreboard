import { create } from "zustand";
import type { RoomView, UiState } from "@riichi/core";

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface RoomStore {
  status: ConnectionStatus;
  room: RoomView | null;
  intents: UiState[];
  playerId: string | null;
  /** 连接被服务端终止的原因（房间不存在 / 已解散）；正常断线重连时为 null */
  closedReason: "not_found" | "dissolved" | "unauthorized" | null;
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
  closedReason: null,
  notice: null,
  set: (partial) => set(partial),
  notify: (tone, text) => set({ notice: { tone, text, at: Date.now() } }),
}));
