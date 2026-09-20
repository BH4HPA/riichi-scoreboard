import type { RoomKind } from "@riichi/core";
import { readLocal, removeLocal, writeLocal } from "@/lib/localStore";

/**
 * 主控台上次开的房间码，每种房型各记一个：回到首页换一种房型再回来，原来的房间还在。
 * 四人房沿用旧键名，升级后本机的房间不丢。
 */
const KEYS: Record<RoomKind, string> = {
  yonma: "riichi.console.room",
  ten: "riichi.console.room.ten",
};

export const readConsoleRoom = (kind: RoomKind) => readLocal(KEYS[kind]);
export const writeConsoleRoom = (kind: RoomKind, code: string) => writeLocal(KEYS[kind], code);
export const forgetConsoleRoom = (kind: RoomKind) => removeLocal(KEYS[kind]);

/** 主控台的地址：房型由首页选定后带在查询参数里（不带 = 四人房，旧书签不坏） */
export const consolePath = (kind: RoomKind) => `/console?kind=${kind}`;
