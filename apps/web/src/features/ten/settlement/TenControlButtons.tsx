import { Check, RefreshCcw, Redo2, Undo2, XCircle } from "lucide-react";
import type { PlayerRef, Seat, TenGameView } from "@riichi/core";
import { Button } from "@/ui/button";
import { Tip } from "@/ui/controls";
import { useRoomStore } from "@/ws/store";
import { useCommand, useSocket } from "@/ws/useRoom";
import { TenDeclareSection } from "../declare/TenDeclareSection";
import type { TenDialog } from "./useTenDialogs";

/**
 * 二人房的操作栏（手机与主控台共用）。按阶段给键，不该出现的不灰着占位：
 * Stage A 只有宣言与「无人宣言流局」；Stage B 才有「自摸和」「被猜中」「王牌流局」。
 */
export function TenControlButtons({
  game,
  seats,
  names,
  mySeat,
  size = "md",
  dissolvable = false,
  onOpen,
}: {
  game: TenGameView;
  seats: (PlayerRef | null)[];
  names: string[];
  mySeat: Seat | null;
  size?: "sm" | "md" | "lg";
  dissolvable?: boolean;
  onOpen: (key: TenDialog) => void;
}) {
  const send = useCommand();
  const socket = useSocket();
  const musicPlaying = useRoomStore((s) => s.room?.music != null);
  const { present } = game;
  const finished = present.status === "finished";
  const stageB = present.stage.kind === "B";
  // 撤销的那一步正是立直宣言（Stage B 还没指定过）时曲子还在放——服务端按命令类型停曲，撤销不在其列——这里顺带停掉；
  // 撤销一轮指定不停：那一局的立直还在
  const undo = () => {
    const { stage } = present;
    const undoesRiichi = stage.kind === "B" && stage.riichi && stage.guesses.length === 0;
    if (undoesRiichi && musicPlaying) socket.music(null);
    void send({ type: "undo" });
  };

  return (
    <div className="space-y-3">
      {!finished && !stageB && (
        <TenDeclareSection game={present} seats={seats} names={names} mySeat={mySeat} size={size} />
      )}
      <section>
        <h3 className="mb-1.5 text-xs font-medium text-muted">
          {finished ? "操作记录" : stageB ? "Stage B · 这一局的结果" : "这一局的结果"}
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {!finished && stageB && (
            <>
              <Button size={size} variant="accent" onClick={() => onOpen("tsumo")}>
                自摸和
              </Button>
              <Button size={size} variant="outline" onClick={() => onOpen("guessed")}>
                被猜中
              </Button>
              <Button size={size} variant="outline" onClick={() => onOpen("exhausted")}>
                王牌流局
              </Button>
            </>
          )}
          {!finished && !stageB && (
            <Button size={size} variant="outline" onClick={() => onOpen("noDeclare")}>
              无人宣言流局
            </Button>
          )}
          <Tip
            content={
              game.undoDepth > 0 ? "撤销上一步（宣言、指定、结果都能撤）" : "暂无可撤销的操作"
            }
          >
            <Button
              size={size}
              variant="outline"
              className="w-full"
              disabled={game.undoDepth === 0}
              onClick={undo}
            >
              <Undo2 className="h-4 w-4" /> 撤销
            </Button>
          </Tip>
          <Tip content={game.redoDepth > 0 ? "重做上一步" : "暂无可重做的操作"}>
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
          {!finished ? (
            <Button size={size} variant="outline" onClick={() => onOpen("end")}>
              <Check className="h-4 w-4" /> 终局
            </Button>
          ) : (
            <Button size={size} variant="outline" onClick={() => onOpen("lobby")}>
              返回大厅
            </Button>
          )}
          {/* 重开要先终局（服务端如此）：对局中不摆一个点了必然失败的键 */}
          {finished && (
            <Button
              size={size}
              variant="outline"
              className="text-neg"
              onClick={() => onOpen("newGame")}
            >
              <RefreshCcw className="h-4 w-4" /> 重开一局
            </Button>
          )}
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
