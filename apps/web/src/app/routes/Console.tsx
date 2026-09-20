import { useEffect } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { Home, Wifi } from "lucide-react";
import { isRoomKind, seatNames } from "@riichi/core";
import { Button } from "@/ui/button";
import { Notice } from "@/ui/notice";
import { useMediaQuery, WIDE_CONSOLE_QUERY } from "@/lib/useMediaQuery";
import { useRoomStore } from "@/ws/store";
import { SocketContext, useRoomConnection } from "@/ws/useRoom";
import { forgetConsoleRoom } from "@/features/console/consoleRooms";
import { useConsoleRoom } from "@/features/console/useConsoleRoom";
import { ConsoleGame } from "@/features/console/ConsoleGame";
import { TenConsoleGame } from "@/features/ten/TenConsoleGame";
import { DissolveButton } from "@/features/console/DissolveButton";
import { ConsoleLobby } from "@/features/lobby/ConsoleLobby";
import { RiichiMusicPlayer } from "@/features/music/RiichiMusicPlayer";

/** 主控台入口：建房/连房、按阶段与屏宽装配大厅或对局页。 */
export function Console() {
  // 房型来自首页的选择；不带参数（旧书签）就是四人房
  const [params] = useSearchParams();
  const requested = params.get("kind");
  const kind = isRoomKind(requested) ? requested : "yonma";
  const location = useLocation();
  const navigate = useNavigate();
  // 首页点「新建」带来的一次性意图；建成后从历史记录里拿掉，刷新不会再建一个
  const fresh = (location.state as { fresh?: boolean } | null)?.fresh === true;
  const { code, error } = useConsoleRoom(kind, fresh);
  useEffect(() => {
    if (fresh && code) void navigate(location.pathname + location.search, { replace: true });
  }, [fresh, code, navigate, location.pathname, location.search]);
  const socket = useRoomConnection(code);
  const room = useRoomStore((s) => s.room);
  const intents = useRoomStore((s) => s.intents);
  const closedReason = useRoomStore((s) => s.closedReason);
  const wide = useMediaQuery(WIDE_CONSOLE_QUERY);

  // 房间被解散（本机或其它端发起）：回首页，由人决定接下来开哪种房间——不再自动建一个新的
  useEffect(() => {
    if (closedReason !== "dissolved") return;
    forgetConsoleRoom(kind);
    void navigate("/", { replace: true });
  }, [closedReason, kind, navigate]);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <p className="text-neg">{error}</p>
        <Button asChild variant="outline">
          <Link to="/">返回首页</Link>
        </Button>
      </div>
    );
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
            intents={intents}
            wide={wide}
            extraActions={
              <>
                {/* 房型在首页选：没有这个出口，进了四人主控台想改开二人房只能手改地址 */}
                <Button asChild size="lg" variant="ghost">
                  <Link to="/">
                    <Home className="h-5 w-5" /> 返回首页
                  </Link>
                </Button>
                <DissolveButton code={room.code} size="lg" variant="ghost" className="text-neg" />
              </>
            }
          />
        ) : room.kind === "ten" ? (
          <TenConsoleGame room={room} game={room.game} intents={intents} wide={wide} />
        ) : (
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
