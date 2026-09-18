/**
 * localStorage 的容错读写：私密模式、配额用尽或被禁用时读到 null、写入静默放弃。
 * 这里存的都是「记住上次选择」一类的便利项，丢了只是回到默认值。
 */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
}

/** JSON 值：解析失败或校验不过都算没有。 */
export function readLocalJson<T>(key: string, parse: (raw: unknown) => T): T | null {
  const raw = readLocal(key);
  if (raw === null) return null;
  try {
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
