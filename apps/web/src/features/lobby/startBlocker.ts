import type { RoomView } from "@riichi/core";

/** 开局键为什么还不能按：先看入座，再看准备；可以开局时为 null。 */
export function startBlocker(room: Pick<RoomView, "seats" | "ready">): string | null {
  const empty = room.seats.filter((s) => s === null).length;
  if (empty > 0) return `还差 ${empty} 人入座`;
  const notReady = room.ready.filter((r) => !r).length;
  return notReady > 0 ? `${notReady} 人未准备` : null;
}
