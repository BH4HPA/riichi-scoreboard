import type { GameState, RoomRules, Seat } from "@riichi/core";
import { useCommand } from "@/ws/useRoom";
import { DissolveDialog } from "@/features/console/DissolveButton";
import { TsumoDialog, RonDialog } from "../WinDialogs";
import {
  AbortiveDialog,
  AdjustDialog,
  ChomboDialog,
  ConfirmDialog,
  DrawDialog,
} from "../OtherDialogs";
import type { ControlDialog } from "./useControlDialogs";

/** 操作栏的全部对话框；`dissolveCode` 只有主控台传（解散确认）。 */
export function ControlHost({
  dialog,
  onClose,
  game,
  names,
  rules,
  mirror,
  mySeat,
  dissolveCode,
}: {
  dialog: ControlDialog | null;
  onClose: () => void;
  game: GameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
  mySeat: Seat | null;
  dissolveCode?: string;
}) {
  const send = useCommand();
  const openOf = (key: ControlDialog) => ({
    open: dialog === key,
    onOpenChange: (open: boolean) => {
      if (!open) onClose();
    },
  });
  const shared = { game, names, rules, mirror };
  const seated = { ...shared, mySeat };

  return (
    <>
      <TsumoDialog {...openOf("tsumo")} {...seated} />
      <RonDialog {...openOf("ron")} {...seated} />
      <DrawDialog {...openOf("draw")} {...seated} />
      <AbortiveDialog {...openOf("abortive")} {...seated} />
      <ChomboDialog {...openOf("chombo")} {...seated} />
      <AdjustDialog {...openOf("adjust")} {...shared} />
      <ConfirmDialog
        {...openOf("end")}
        title="现在终局结算？"
        description="将按当前点数结算名次与马点，残留立直供托按规则分配。此操作可撤销。"
        confirmText="确认终局"
        onConfirm={() => send({ type: "endGame" })}
      />
      <ConfirmDialog
        {...openOf("newGame")}
        title="重开一局？"
        description="点数、场次、本场数、立直供托与历史记录将重置为初始状态；座位与规则保持不变。此操作不可撤销。"
        confirmText="确认重开"
        danger
        onConfirm={() => send({ type: "newGame" })}
      />
      <ConfirmDialog
        {...openOf("lobby")}
        title="返回大厅？"
        description="回到大厅后可以调整座位与规则，再开新的一局。已完成对局的战绩已保存。"
        confirmText="返回大厅"
        onConfirm={() => send({ type: "toLobby" })}
      />
      {dissolveCode && <DissolveDialog code={dissolveCode} {...openOf("dissolve")} />}
    </>
  );
}
