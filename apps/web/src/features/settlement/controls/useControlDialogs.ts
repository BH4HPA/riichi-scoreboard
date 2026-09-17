import { useState } from "react";
import { useRoomStore } from "@/ws/store";
import { useSocket } from "@/ws/useRoom";

export type ControlDialog =
  | "tsumo"
  | "ron"
  | "draw"
  | "abortive"
  | "chombo"
  | "adjust"
  | "end"
  | "newGame"
  | "lobby"
  | "dissolve";

/** 点这些键即让电视停掉立直音乐（弹窗取消也不恢复）；调整场况、终局等管理类不停。 */
const SETTLEMENT_KEYS: ReadonlySet<ControlDialog> = new Set([
  "tsumo",
  "ron",
  "draw",
  "abortive",
  "chombo",
]);

/** 操作栏对话框的开关状态：按钮与对话框宿主分开渲染，由调用方决定两者挂在哪里。 */
export function useControlDialogs() {
  const socket = useSocket();
  const musicPlaying = useRoomStore((s) => s.room?.music != null);
  const [dialog, setDialog] = useState<ControlDialog | null>(null);
  const open = (key: ControlDialog) => {
    if (SETTLEMENT_KEYS.has(key) && musicPlaying) socket.music(null);
    setDialog(key);
  };
  return { dialog, open, close: () => setDialog(null) };
}
