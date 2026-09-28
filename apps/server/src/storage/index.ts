/**
 * 对象存储：头像等用户文件。key 相对于存储根（如 `avatars/<playerId>/<file>`），
 * 返回可直接放进 `<img src>` 的公开 URL（只有公开前缀的对象读得到，见 isPublicKey）。
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

/**
 * 公开对象白名单：只有头像要给同桌看。其余（识别照片：定格照 `hands/`、采样帧 `samples/`）是玩家牌桌的照片，
 * 只供训练回流（带密钥下载），存成私有对象。用白名单而不是私有前缀黑名单：新加一类对象默认私有；
 * 大小写不敏感的文件系统上 `HANDS/…` 也绕不过去。
 *
 * 注意：COS 桶私有 + CDN 开了「私有存储桶回源鉴权」时，CDN 会带凭证回源，对象 ACL 挡不住经 CDN 的访问。
 * 线上接受这一点：照片 key 带随机串、从不下发给客户端，采样帧另行定期清理。
 */
const PUBLIC_PREFIXES = ["avatars/"];

export function isPublicKey(key: string): boolean {
  return PUBLIC_PREFIXES.some((p) => key.startsWith(p));
}
