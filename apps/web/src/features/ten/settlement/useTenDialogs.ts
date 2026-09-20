import type { TenDrawReason } from "@riichi/core";
import type { DraftKind } from "@/features/settlement/drafts/store";
import { useDialogSwitch } from "@/features/settlement/controls/useDialogSwitch";

export type TenDialog =
  "tsumo" | TenDrawReason | "end" | "newGame" | "lobby" | "guide" | "dissolve";

/** 记一局结果的键：点了就让电视停掉立直音乐 */
const SETTLEMENT_KEYS: ReadonlySet<TenDialog> = new Set([
  "tsumo",
  "noDeclare",
  "guessed",
  "exhausted",
]);
const DRAFT_KEYS: ReadonlyMap<TenDialog, DraftKind> = new Map([["tsumo", "tsumo"]]);

/** 二人房操作栏对话框的开关状态。 */
export function useTenDialogs() {
  return useDialogSwitch(SETTLEMENT_KEYS, DRAFT_KEYS);
}
