import { useState } from "react";
import { useParams } from "react-router";
import { BookOpen, History, ScrollText, User, Wifi } from "lucide-react";
import { seatNames } from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { ConnectionBadge, Notice } from "@/ui/notice";
import { mySeat as seatOf, useRoomStore } from "@/ws/store";
import { SocketContext, useCommand, useRoomConnection } from "@/ws/useRoom";
import { PhoneLobby } from "@/features/lobby/PhoneLobby";
import { RoundHeader } from "@/features/scoreboard/RoundHeader";
import { PointsGrid } from "@/features/scoreboard/PointsGrid";
import { DiffMatrix } from "@/features/scoreboard/DiffMatrix";
import { HistoryList } from "@/features/history/HistoryTable";
import { FinalPanel } from "@/features/final/FinalPanel";
import { ControlPanel } from "@/features/settlement/ControlPanel";
import { ReferenceSheet, type ReferenceTab } from "@/features/reference/ReferenceSheet";
import { RulesEditor } from "@/features/rules/RulesEditor";
import { ProfileEditor, StatsPanel } from "@/features/profile/ProfileEditor";
import { useMirror } from "@/features/settlement/useMirror";

type Sheet = "reference" | "rules" | "history" | "me" | null;

export function Room() {
  const { code } = useParams<{ code: string }>();
  const roomCode = code?.toUpperCase() ?? null;
  const socket = useRoomConnection(roomCode);
  const room = useRoomStore((s) => s.room);
  const status = useRoomStore((s) => s.status);
  const playerId = useRoomStore((s) => s.playerId);

  if (status === "closed" && !room) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-center text-neg">
        房间 {roomCode} 不存在或已关闭
      </div>
    );
  }
  if (!socket || !room) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-muted">
        <Wifi className="h-5 w-5 animate-pulse" /> 正在连接房间 {roomCode}…
      </div>
    );
  }
  const mySeat = seatOf(room, playerId);

  return (
    <SocketContext.Provider value={socket}>
      {room.phase === "lobby" || !room.game ? (
        <PhoneLobby room={room} mySeat={mySeat} />
      ) : (
        <PhoneGame />
      )}
      <Notice />
    </SocketContext.Provider>
  );
}

function PhoneGame() {
  const room = useRoomStore((s) => s.room)!;
  const playerId = useRoomStore((s) => s.playerId);
  const send = useCommand();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [refTab, setRefTab] = useState<ReferenceTab>("yaku");
  useMirror(sheet === "reference", { kind: "reference", tab: refTab }, true);
  useMirror(sheet === "rules", { kind: "rules" }, true);
  const game = room.game!;
  const names = seatNames(room);
  const mySeat = seatOf(room, playerId);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pb-24 pt-4">
      <RoundHeader game={game.present} names={names} rules={room.rules} />
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>房间 {room.code}</span>
        <ConnectionBadge />
      </div>
      <PointsGrid
        game={game.present}
        seats={room.seats}
        names={names}
        rules={room.rules}
        highlightSeat={mySeat}
      />
      {game.present.status === "finished" && (
        <div className="rounded-xl border border-pos/40 bg-surface p-3">
          <h2 className="mb-1 text-base font-semibold">终局结算</h2>
          <FinalPanel game={game.present} seats={room.seats} names={names} rules={room.rules} />
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface p-3">
        <ControlPanel
          game={game}
          names={names}
          rules={room.rules}
          mirror
          mySeat={mySeat}
          size="sm"
        />
      </div>
      <div className="rounded-xl border border-border bg-surface p-3">
        <DiffMatrix game={game.present} names={names} rules={room.rules} />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {(
            [
              ["history", History, "记录"],
              ["reference", BookOpen, "番符表"],
              ["rules", ScrollText, "规则"],
              ["me", User, "我的"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSheet(key)}
              className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted hover:text-fg"
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <Dialog open={sheet === "history"} onOpenChange={(o) => !o && setSheet(null)}>
        <DialogContent title="历史记录" description={`共 ${game.present.history.length} 条`}>
          <HistoryList history={game.present.history} />
        </DialogContent>
      </Dialog>
      <Dialog open={sheet === "reference"} onOpenChange={(o) => !o && setSheet(null)}>
        <DialogContent title="番符表" description="打开时电视会同步显示">
          <ReferenceSheet rules={room.rules} tab={refTab} onTabChange={setRefTab} />
        </DialogContent>
      </Dialog>
      <Dialog open={sheet === "rules"} onOpenChange={(o) => !o && setSheet(null)}>
        <DialogContent title="房间规则" description="对局进行中，规则已锁定">
          <RulesEditor value={room.rules} onChange={() => undefined} editable={false} />
        </DialogContent>
      </Dialog>
      <Dialog open={sheet === "me"} onOpenChange={(o) => !o && setSheet(null)}>
        <DialogContent title="我的">
          <ProfileEditor
            onNameChange={(name) =>
              mySeat !== null && send({ type: "setPlayerName", seat: mySeat, name })
            }
          />
          <h3 className="mb-2 mt-4 text-sm font-medium">战绩</h3>
          <StatsPanel />
          <div className="mt-4">
            <Button variant="ghost" size="sm" onClick={() => setSheet(null)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
