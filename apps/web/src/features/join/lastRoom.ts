const KEY = "riichi.room.last";

/** 手机最近进过的房间码：首页据此给「返回房间」，房间不在了就清掉。 */
export function readLastRoom(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeLastRoom(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* 私密模式等写不进去：只是首页没有返回入口 */
  }
}

export function clearLastRoom(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 同上 */
  }
}
