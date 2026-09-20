import type { GameState, RoomRules, Seat } from "@riichi/core";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { useCommand } from "@/ws/useRoom";
import { DissolveDialog } from "@/features/console/DissolveButton";
import { AbortiveDialog } from "../dialogs/AbortiveDialog";
import { AdjustDialog } from "../dialogs/AdjustDialog";
import { ChomboDialog } from "../dialogs/ChomboDialog";
import { DrawDialog } from "../dialogs/DrawDialog";
import { RonDialog } from "../dialogs/RonDialog";
import { TsumoDialog } from "../dialogs/TsumoDialog";
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
  const shared = { game, names, rules, mirror, mySeat };

  return (
    <>
      <TsumoDialog {...openOf("tsumo")} {...shared} />
      <RonDialog {...openOf("ron")} {...shared} />
      <DrawDialog {...openOf("draw")} {...shared} />
      <AbortiveDialog {...openOf("abortive")} {...shared} />
      <ChomboDialog {...openOf("chombo")} {...shared} />
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
        title="重开整场？"
        description={`${game.status === "finished" ? "" : "放弃眼下这一场（不计入战绩）。"}点数、场次、本场数、立直供托与历史记录将重置为初始状态；座位与规则保持不变。此操作不可撤销。`}
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
