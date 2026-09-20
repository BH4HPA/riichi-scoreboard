import { useEffect } from "react";
import { Wifi } from "lucide-react";
import { seatNames } from "@riichi/core";
import { Notice } from "@/ui/notice";
import { useMediaQuery, WIDE_CONSOLE_QUERY } from "@/lib/useMediaQuery";
import { useRoomStore } from "@/ws/store";
import { SocketContext, useRoomConnection } from "@/ws/useRoom";
import { useConsoleRoom } from "@/features/console/useConsoleRoom";
import { ConsoleGame } from "@/features/console/ConsoleGame";
import { DissolveButton } from "@/features/console/DissolveButton";
import { ConsoleLobby } from "@/features/lobby/ConsoleLobby";
import { RiichiMusicPlayer } from "@/features/music/RiichiMusicPlayer";

/** 主控台入口：建房/连房、按阶段与屏宽装配大厅或对局页。 */
export function Console() {
  const { code, error, newRoom } = useConsoleRoom();
  const socket = useRoomConnection(code);
  const room = useRoomStore((s) => s.room);
  const intents = useRoomStore((s) => s.intents);
  const closedReason = useRoomStore((s) => s.closedReason);
  const wide = useMediaQuery(WIDE_CONSOLE_QUERY);

  // 房间被解散（本机或其它端发起）后自动开新房；新连接建立时 closedReason 会被清空，不会重复触发
  useEffect(() => {
    if (closedReason === "dissolved") void newRoom();
  }, [closedReason, newRoom]);

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

  return (
    <SocketContext.Provider value={socket}>
      <div className="min-h-dvh bg-bg text-fg">
        {room.phase === "lobby" || !room.game ? (
          <ConsoleLobby
            room={room}
            wide={wide}
            extraActions={
              <DissolveButton code={room.code} size="lg" variant="ghost" className="text-neg" />
            }
          />
        ) : room.kind === "ten" ? null : (
          <ConsoleGame
            room={room}
            game={room.game}
            names={seatNames(room)}
            intents={intents}
            wide={wide}
          />
        )}
        <RiichiMusicPlayer music={room.music} names={seatNames(room)} />
        <Notice />
      </div>
    </SocketContext.Provider>
  );
}
