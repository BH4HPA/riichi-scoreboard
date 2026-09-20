import { BookOpen, Check, RefreshCcw, Redo2, Undo2, XCircle } from "lucide-react";
import type { PlayerRef, Seat, TenGameView, TenTimeMark } from "@riichi/core";
import { Button } from "@/ui/button";
import { Tip } from "@/ui/controls";
import { useRoomStore } from "@/ws/store";
import { useCommand, useSocket } from "@/ws/useRoom";
import { TenDeclareSection } from "../declare/TenDeclareSection";
import type { TenDialog } from "./useTenDialogs";

/**
 * 二人房的操作栏（手机与主控台共用），分节与四人房一致：对局中 / 结算 / 比赛进程。
 * 按阶段给键，不该出现的不灰着占位：Stage A 的结算只有「流局」（无人宣言）；Stage B 才有「自摸」「被猜中」，
 * 这时的「流局」是摸到王牌。具体记成哪一种由确认框写明。
 */
export function TenControlButtons({
  game,
  seats,
  names,
  mySeat,
  timeMark,
  size = "md",
  dissolvable = false,
  onOpen,
}: {
  game: TenGameView;
  seats: (PlayerRef | null)[];
  names: string[];
  mySeat: Seat | null;
  timeMark: TenTimeMark;
  size?: "sm" | "md" | "lg";
  /** 主控台专属：最后一段放「玩法说明」（手机在底栏的「规则」页里看）与「解散房间」 */
  dissolvable?: boolean;
  onOpen: (key: TenDialog) => void;
}) {
  const send = useCommand();
  const socket = useSocket();
  const musicPlaying = useRoomStore((s) => s.room?.music != null);
  const { present } = game;
  const finished = present.status === "finished";
  const stageB = present.stage.kind === "B";
  // 时间到且上一局已经记完（回到 Stage A）：该收尾了，把「终局」顶成最显眼的键。仍不自动终局、不拦着继续打
  const timeUp = timeMark === 3 && !stageB;
  // Stage B 里撤销的就是宣言（划牌不占撤销栈）。撤的是立直时曲子还在放——服务端按命令类型停曲，撤销不在其列——这里顺带停掉
  const undo = () => {
    const { stage } = present;
    if (stage.kind === "B" && stage.riichi && musicPlaying) socket.music(null);
    void send({ type: "undo" });
  };

  return (
    <div className="space-y-3">
      {!finished && !stageB && (
        <TenDeclareSection game={present} seats={seats} names={names} mySeat={mySeat} size={size} />
      )}
      <section>
        <h3 className="mb-1.5 text-xs font-medium text-muted">{finished ? "操作记录" : "结算"}</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {!finished && stageB && (
            <>
              <Button size={size} variant="accent" onClick={() => onOpen("tsumo")}>
                自摸
              </Button>
              <Button size={size} variant="outline" onClick={() => onOpen("guessed")}>
                被猜中
              </Button>
              <Button size={size} variant="outline" onClick={() => onOpen("exhausted")}>
                流局
              </Button>
            </>
          )}
          {!finished && !stageB && (
            <Button size={size} variant="outline" onClick={() => onOpen("noDeclare")}>
              流局
            </Button>
          )}
          <Tip content={game.undoDepth > 0 ? "撤销上一步" : "暂无可撤销的操作"}>
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
            <Button
              size={size}
              variant={timeUp ? "accent" : "outline"}
              onClick={() => onOpen("end")}
            >
              <Check className="h-4 w-4" /> 终局
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
            <RefreshCcw className="h-4 w-4" /> 重开整场
          </Button>
        </div>
      </section>
      {dissolvable && (
        <section>
          <h3 className="mb-1.5 text-xs font-medium text-muted">房间</h3>
          <div className="grid grid-cols-3 gap-1.5">
            <Button size={size} variant="outline" onClick={() => onOpen("guide")}>
              <BookOpen className="h-4 w-4" /> 玩法说明
            </Button>
            <Button size={size} variant="danger" onClick={() => onOpen("dissolve")}>
              <XCircle className="h-4 w-4" /> 解散房间
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
