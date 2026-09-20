import { useEffect, useState } from "react";
import { useRoomStore } from "@/ws/store";
import { useSocket } from "@/ws/useRoom";
import { roomDraftStamp } from "../drafts/stamp";
import { clearRoomDrafts, draftKey, ensureDraft, type DraftKind } from "../drafts/store";

/**
 * 操作栏对话框的开关状态（两种房型共用）：按钮与对话框宿主分开渲染，由调用方决定两者挂在哪里。
 * `settlementKeys`：点这些键即让电视停掉立直音乐（弹窗取消也不恢复）；
 * `draftKeys`：打开这些键前先备好结算草稿（局面一致沿用，否则换新）。
 */
export function useDialogSwitch<K extends string>(
  settlementKeys: ReadonlySet<K>,
  draftKeys: ReadonlyMap<K, DraftKind>,
) {
  const socket = useSocket();
  const musicPlaying = useRoomStore((s) => s.room?.music != null);
  const code = useRoomStore((s) => s.room?.code);
  const [dialog, setDialog] = useState<K | null>(null);
  // 离开对局页（回大厅、退出房间）时丢掉这个房间的结算草稿
  useEffect(() => {
    if (code) return () => clearRoomDrafts(code);
  }, [code]);
  const open = (key: K) => {
    if (settlementKeys.has(key) && musicPlaying) socket.music(null);
    const room = useRoomStore.getState().room;
    const stamp = room ? roomDraftStamp(room) : null;
    const kind = draftKeys.get(key);
    if (kind && room && stamp !== null) ensureDraft(draftKey(room.code, kind), stamp);
    setDialog(key);
  };
  return { dialog, open, close: () => setDialog(null) };
}
