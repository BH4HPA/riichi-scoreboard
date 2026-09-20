import type { DraftKind } from "../drafts/store";
import { useDialogSwitch } from "./useDialogSwitch";

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

const DRAFT_KEYS: ReadonlyMap<ControlDialog, DraftKind> = new Map([
  ["tsumo", "tsumo"],
  ["ron", "ron"],
]);

/** 四人房操作栏对话框的开关状态。 */
export function useControlDialogs() {
  return useDialogSwitch(SETTLEMENT_KEYS, DRAFT_KEYS);
}
