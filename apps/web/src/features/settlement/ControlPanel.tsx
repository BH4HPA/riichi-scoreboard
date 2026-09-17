import { useState, type ReactNode } from "react";
import { Check, RefreshCcw, Redo2, Undo2 } from "lucide-react";
import type { GameView, RoomRules, Seat } from "@riichi/core";
import { Button } from "@/ui/button";
import { Tip } from "@/ui/controls";
import { useRoomStore } from "@/ws/store";
import { useCommand, useSocket } from "@/ws/useRoom";
import { RiichiSection } from "@/features/music/RiichiSection";
import { TsumoDialog, RonDialog } from "./WinDialogs";
import {
  AbortiveDialog,
  AdjustDialog,
  ChomboDialog,
  ConfirmDialog,
  DrawDialog,
} from "./OtherDialogs";

type DialogKey =
  "tsumo" | "ron" | "draw" | "abortive" | "chombo" | "adjust" | "end" | "newGame" | "lobby" | null;

/** 结算与进程操作栏：手机端与主控台共用；mirror 决定是否向电视镜像弹窗。 */
export function ControlPanel({
  game,
  names,
  rules,
  mirror,
  mySeat,
  size = "md",
  roomActions,
}: {
  game: GameView;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
  mySeat: Seat | null;
  size?: "sm" | "md" | "lg";
  /** 主控台专属的房间级操作（如解散房间），放在最后一段 */
  roomActions?: ReactNode;
}) {
  const send = useCommand();
  const socket = useSocket();
  const musicPlaying = useRoomStore((s) => s.room?.music != null);
  const [dialog, setDialog] = useState<DialogKey>(null);
  const present = game.present;
  const finished = present.status === "finished";
  const openOf = (key: DialogKey) => (open: boolean) => setDialog(open ? key : null);
  const shared = { game: present, names, rules, mirror };
  const seated = { ...shared, mySeat };
  // 点任意结算键即让电视停掉立直音乐，弹窗取消也不恢复
  const openSettlement = (key: DialogKey) => {
    if (musicPlaying) socket.music(null);
    setDialog(key);
  };

  return (
    <div className="space-y-3">
      <RiichiSection disabled={finished} size={size} />
      <section>
        <h3 className="mb-1.5 text-xs font-medium text-muted">结算</h3>
        <div className="grid grid-cols-3 gap-1.5">
          <Button
            size={size}
            variant="accent"
            disabled={finished}
            onClick={() => openSettlement("tsumo")}
          >
            自摸
          </Button>
          <Button
            size={size}
            variant="accent"
            disabled={finished}
            onClick={() => openSettlement("ron")}
          >
            荣和
          </Button>
          <Button
            size={size}
            variant="outline"
            disabled={finished}
            onClick={() => openSettlement("draw")}
          >
            流局
          </Button>
          {rules.progress.abortiveDraws && (
            <Button
              size={size}
              variant="outline"
              disabled={finished}
              onClick={() => openSettlement("abortive")}
            >
              途中流局
            </Button>
          )}
          {rules.progress.chombo !== "none" && (
            <Button
              size={size}
              variant="outline"
              disabled={finished}
              onClick={() => openSettlement("chombo")}
            >
              错和
            </Button>
          )}
          <Tip content={game.undoDepth > 0 ? "撤销上一次操作" : "暂无可撤销的结算"}>
            <Button
              size={size}
              variant="outline"
              className="w-full"
              disabled={game.undoDepth === 0}
              onClick={() => send({ type: "undo" })}
            >
              <Undo2 className="h-4 w-4" /> 撤销
            </Button>
          </Tip>
          <Tip content={game.redoDepth > 0 ? "重做上一次操作" : "暂无可重做的结算"}>
            <Button
              size={size}
              variant="outline"
              className="w-full"
              disabled={game.redoDepth === 0}
              onClick={() => send({ type: "redo" })}
            >
              <Redo2 className="h-4 w-4" /> 重做
            </Button>
          </Tip>
        </div>
      </section>
      <section>
        <h3 className="mb-1.5 text-xs font-medium text-muted">比赛进程</h3>
        <div className="grid grid-cols-3 gap-1.5">
          <Button size={size} variant="outline" onClick={() => setDialog("adjust")}>
            调整场况
          </Button>
          {!finished ? (
            <Button size={size} variant="positive" onClick={() => setDialog("end")}>
              <Check className="h-4 w-4" /> 终局结算
            </Button>
          ) : (
            <Button size={size} variant="outline" onClick={() => setDialog("lobby")}>
              返回大厅
            </Button>
          )}
          <Button size={size} variant="danger" onClick={() => setDialog("newGame")}>
            <RefreshCcw className="h-4 w-4" /> 重开一局
          </Button>
        </div>
      </section>
      {roomActions && (
        <section>
          <h3 className="mb-1.5 text-xs font-medium text-muted">房间</h3>
          <div className="grid grid-cols-3 gap-1.5">{roomActions}</div>
        </section>
      )}

      <TsumoDialog open={dialog === "tsumo"} onOpenChange={openOf("tsumo")} {...seated} />
      <RonDialog open={dialog === "ron"} onOpenChange={openOf("ron")} {...seated} />
      <DrawDialog open={dialog === "draw"} onOpenChange={openOf("draw")} {...seated} />
      <AbortiveDialog open={dialog === "abortive"} onOpenChange={openOf("abortive")} {...seated} />
      <ChomboDialog open={dialog === "chombo"} onOpenChange={openOf("chombo")} {...seated} />
      <AdjustDialog open={dialog === "adjust"} onOpenChange={openOf("adjust")} {...shared} />
      <ConfirmDialog
        open={dialog === "end"}
        onOpenChange={openOf("end")}
        title="现在终局结算？"
        description="将按当前点数结算名次与马点，残留立直供托按规则分配。此操作可撤销。"
        confirmText="确认终局"
        onConfirm={() => send({ type: "endGame" })}
      />
      <ConfirmDialog
        open={dialog === "newGame"}
        onOpenChange={openOf("newGame")}
        title="重开一局？"
        description="点数、场次、本场数、立直供托与历史记录将重置为初始状态；座位与规则保持不变。此操作不可撤销。"
        confirmText="确认重开"
        danger
        onConfirm={() => send({ type: "newGame" })}
      />
      <ConfirmDialog
        open={dialog === "lobby"}
        onOpenChange={openOf("lobby")}
        title="返回大厅？"
        description="回到大厅后可以调整座位与规则，再开新的一局。已完成对局的战绩已保存。"
        confirmText="返回大厅"
        onConfirm={() => send({ type: "toLobby" })}
      />
    </div>
  );
}
