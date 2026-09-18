import { randomBytes } from "node:crypto";
import type { PlayerRow, PlayersRepo } from "../db/players";
import type { ObjectStore } from "../storage";

/** 头像：客户端已缩放到 256px，服务端只校验类型与大小。 */
export const AVATAR_MAX_BYTES = 300 * 1024;

const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function sniffImage(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45
  )
    return "image/webp";
  return null;
}

export class AvatarError extends Error {
  constructor(
    public readonly code: "bad_avatar",
    message: string,
  ) {
    super(message);
    this.name = "AvatarError";
  }
}

function datePart(now: number): string {
  return new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
}

export interface AvatarDeps {
  store: ObjectStore;
  players: PlayersRepo;
}

/** 校验 → 上传新对象 → 更新玩家行 → 尽力删除旧对象。 */
export async function saveAvatar(
  deps: AvatarDeps,
  player: PlayerRow,
  bytes: Uint8Array,
  now = Date.now(),
): Promise<PlayerRow> {
  if (bytes.byteLength === 0 || bytes.byteLength > AVATAR_MAX_BYTES) {
    throw new AvatarError("bad_avatar", "头像需为不超过 300KB 的图片");
  }
  const type = sniffImage(bytes);
  const ext = type ? AVATAR_TYPES[type] : undefined;
  if (!type || !ext) throw new AvatarError("bad_avatar", "仅支持 JPEG / PNG / WebP");
  const key = `avatars/${player.id}/${datePart(now)}-${randomBytes(6).toString("hex")}.${ext}`;
  const url = await deps.store.put(key, bytes, type);
  const row = deps.players.update(player.id, { avatar: url, avatarKey: key });
  await removeQuietly(deps.store, player.avatar_key);
  return row;
}

export async function clearAvatar(deps: AvatarDeps, player: PlayerRow): Promise<PlayerRow> {
  deps.players.update(player.id, { avatar: null, avatarKey: null });
  await removeQuietly(deps.store, player.avatar_key);
  // 删对象期间可能有并发的档案修改；返回最新行，调用方据此同步座位快照
  return deps.players.byId(player.id) ?? player;
}

async function removeQuietly(store: ObjectStore, key: string | null): Promise<void> {
  if (!key) return;
  try {
    await store.remove(key);
  } catch (err) {
    console.error(`[avatar] 删除旧对象失败 key=${key}`, err);
  }
}
