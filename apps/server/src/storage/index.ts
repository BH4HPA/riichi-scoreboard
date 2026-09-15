/**
 * 对象存储：头像等用户文件。key 相对于存储根（如 `avatars/<playerId>/<file>`），
 * 返回可直接放进 `<img src>` 的公开 URL。
 */
export interface ObjectStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
  remove(key: string): Promise<void>;
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

/** key 只允许安全字符且不能含 `..` 段，防止本地存储路径穿越。 */
export function assertObjectKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.split("/").some((seg) => seg === "" || seg === "..")) {
    throw new Error(`非法对象 key：${key}`);
  }
}
