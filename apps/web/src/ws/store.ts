import { create } from "zustand";
import type { RoomView, Seat, UiState } from "@riichi/core";

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface RoomStore {
  status: ConnectionStatus;
  room: RoomView | null;
  intents: UiState[];
  clientId: string | null;
  playerId: string | null;
  /** 最近一次错误提示（会被新消息覆盖） */
  notice: { tone: "error" | "info"; text: string; at: number } | null;
  set(partial: Partial<RoomStore>): void;
  notify(tone: "error" | "info", text: string): void;
}

export const useRoomStore = create<RoomStore>()((set) => ({
  status: "idle",
  room: null,
  intents: [],
  clientId: null,
  playerId: null,
  notice: null,
  set: (partial) => set(partial),
  notify: (tone, text) => set({ notice: { tone, text, at: Date.now() } }),
}));

export function mySeat(room: RoomView | null, playerId: string | null): Seat | null {
  if (!room || !playerId) return null;
  const idx = room.seats.findIndex((p) => p?.id === playerId);
  return idx === -1 ? null : (idx as Seat);
}
