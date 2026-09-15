import { useCallback, useEffect, useState } from "react";
import { PanelRightOpen, Wifi } from "lucide-react";
import { seatNames, type RoomView } from "@riichi/core";
import { api, ApiError } from "@/api/client";
import { useSession } from "@/api/session";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { ConnectionBadge, Notice } from "@/ui/notice";
import { useRoomStore } from "@/ws/store";
import { SocketContext, useRoomConnection } from "@/ws/useRoom";
import { ConsoleLobby } from "@/features/lobby/ConsoleLobby";
import { RoundHeader } from "@/features/scoreboard/RoundHeader";
import { PointsGrid } from "@/features/scoreboard/PointsGrid";
import { DiffMatrix } from "@/features/scoreboard/DiffMatrix";
import { HistoryTable } from "@/features/history/HistoryTable";
import { FinalPanel } from "@/features/final/FinalPanel";
import { ControlPanel } from "@/features/settlement/ControlPanel";
import { MirrorOverlay } from "@/features/mirror/MirrorOverlay";

const ROOM_KEY = "riichi.console.room";

function useConsoleRoom() {
  const ensure = useSession((s) => s.ensure);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
    const { token } = await ensure();
    const { room } = await api<{ room: RoomView }>("/api/rooms", {
      method: "POST",
      body: {},
      token,
    });
    localStorage.setItem(ROOM_KEY, room.code);
    return room.code;
  }, [ensure]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { token } = await ensure();
        const saved = localStorage.getItem(ROOM_KEY);
        if (saved) {
          try {
            await api(`/api/rooms/${saved}`, { token });
            if (active) setCode(saved);
            return;
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 404)) throw err;
          }
        }
        if (!active) return;
        const fresh = await create();
        if (active) setCode(fresh);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "无法连接服务器");
      }
    })();
    return () => {
      active = false;
    };
  }, [ensure, create]);

  const newRoom = useCallback(async () => {
    try {
      setCode(await create());
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法创建房间");
    }
  }, [create]);

  return { code, error, newRoom };
}

export function Console() {
  const { code, error, newRoom } = useConsoleRoom();
  const socket = useRoomConnection(code);
  const room = useRoomStore((s) => s.room);
  const intents = useRoomStore((s) => s.intents);
  const [panelOpen, setPanelOpen] = useState(false);

  if (error) {
    return <div className="flex min-h-dvh items-center justify-center text-neg">{error}</div>;
  }
  if (!socket || !room) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-muted">
        <Wifi className="h-5 w-5 animate-pulse" /> 正在连接房间…
      </div>
    );
  }

  const names = seatNames(room);
  const game = room.game;

  return (
    <SocketContext.Provider value={socket}>
      <div className="min-h-dvh bg-bg text-fg">
        {room.phase === "lobby" || !game ? (
          <ConsoleLobby room={room} onNewRoom={newRoom} />
        ) : (
          <div className="flex h-dvh flex-col gap-4 p-6">
            <header className="flex items-center gap-4">
              <div className="flex-1">
                <RoundHeader game={game.present} names={names} rules={room.rules} tv />
              </div>
              <ConnectionBadge />
              <span className="text-sm text-muted">
                房间 <span className="font-semibold tabular text-fg">{room.code}</span>
              </span>
              <Button variant="outline" size="sm" onClick={() => setPanelOpen(true)}>
                <PanelRightOpen className="h-4 w-4" /> 操作
              </Button>
            </header>

            <main className="grid min-h-0 flex-1 grid-cols-[2fr_3fr] gap-4">
              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
                <PointsGrid
                  game={game.present}
                  seats={room.seats}
                  names={names}
                  rules={room.rules}
                  tv
                />
                <MirrorOverlay intents={intents} names={names} rules={room.rules} />
                {game.present.status === "finished" && (
                  <div className="rounded-xl border border-pos/40 bg-surface p-4">
                    <h2 className="mb-2 text-lg font-semibold">终局结算</h2>
                    <FinalPanel
                      game={game.present}
                      seats={room.seats}
                      names={names}
                      rules={room.rules}
                      tv
                    />
                  </div>
                )}
                <div className="rounded-xl border border-border bg-surface p-3">
                  <DiffMatrix game={game.present} names={names} rules={room.rules} tv />
                </div>
              </div>
              <div className="min-h-0 overflow-y-auto rounded-xl border border-border bg-surface p-3">
                <HistoryTable history={game.present.history} tv />
              </div>
            </main>

            <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
              <DialogContent title="主控台操作" description="也可以用手机远程操作。">
                <ControlPanel
                  game={game}
                  names={names}
                  rules={room.rules}
                  mirror={false}
                  mySeat={null}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}
        <Notice />
      </div>
    </SocketContext.Provider>
  );
}
