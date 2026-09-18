import { readLocal, removeLocal, writeLocal } from "@/lib/localStore";

const KEY = "riichi.room.last";

/** 手机最近进过的房间码：首页据此给「返回房间」，房间不在了就清掉。 */
export const readLastRoom = () => readLocal(KEY);
export const writeLastRoom = (code: string) => writeLocal(KEY, code);
export const clearLastRoom = () => removeLocal(KEY);
