import { Check, RefreshCcw, Redo2, Undo2, XCircle } from "lucide-react";
import type { GameView, RoomRules, Seat } from "@riichi/core";
import { Button } from "@/ui/button";
import { Tip } from "@/ui/controls";
import { useCommand } from "@/ws/useRoom";
import { RiichiSection } from "@/features/music/RiichiSection";
import type { ControlDialog } from "./useControlDialogs";

/** 结算与进程操作栏的按钮：手机端与主控台共用；对话框由 ControlHost 渲染。 */
export function ControlButtons({
  game,
  rules,
  mySeat,
  size = "md",
  dissolvable = false,
  onOpen,
}: {
  game: GameView;
  rules: RoomRules;
  mySeat: Seat | null;
  size?: "sm" | "md" | "lg";
  /** 主控台专属：最后一段放「解散房间」 */
  dissolvable?: boolean;
  onOpen: (key: ControlDialog) => void;
}) {
  const send = useCommand();
  const finished = game.present.status === "finished";

  return (
    <div className="space-y-3">
      <RiichiSection game={game.present} rules={rules} mySeat={mySeat} size={size} />
      <section>
        <h3 className="mb-1.5 text-xs font-medium text-muted">结算</h3>
        <div className="grid grid-cols-3 gap-1.5">
          <Button size={size} variant="accent" disabled={finished} onClick={() => onOpen("tsumo")}>
            自摸
          </Button>
          <Button size={size} variant="accent" disabled={finished} onClick={() => onOpen("ron")}>
            荣和
          </Button>
          <Button size={size} variant="outline" disabled={finished} onClick={() => onOpen("draw")}>
            流局
          </Button>
          {rules.progress.abortiveDraws && (
            <Button
              size={size}
              variant="outline"
              disabled={finished}
              onClick={() => onOpen("abortive")}
            >
              途中流局
            </Button>
          )}
          {rules.progress.chombo !== "none" && (
            <Button
              size={size}
              variant="outline"
              disabled={finished}
              onClick={() => onOpen("chombo")}
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
          <Button size={size} variant="outline" onClick={() => onOpen("adjust")}>
            调整场况
          </Button>
          {!finished ? (
            <Button size={size} variant="outline" onClick={() => onOpen("end")}>
              <Check className="h-4 w-4" /> 终局结算
            </Button>
          ) : (
            <Button size={size} variant="outline" onClick={() => onOpen("lobby")}>
              返回大厅
            </Button>
          )}
          <Button
            size={size}
            variant="outline"
            className="text-neg"
            onClick={() => onOpen("newGame")}
          >
            <RefreshCcw className="h-4 w-4" /> 重开一局
          </Button>
        </div>
      </section>
      {dissolvable && (
        <section>
          <h3 className="mb-1.5 text-xs font-medium text-muted">房间</h3>
          <div className="grid grid-cols-3 gap-1.5">
            <Button size={size} variant="danger" onClick={() => onOpen("dissolve")}>
              <XCircle className="h-4 w-4" /> 解散房间
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
