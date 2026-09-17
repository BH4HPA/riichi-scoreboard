import { useEffect } from "react";
import { useParams } from "react-router";
import { seatOfPlayer } from "@riichi/core";
import { Notice } from "@/ui/notice";
import { useRoomStore } from "@/ws/store";
import { SocketContext, useRoomConnection } from "@/ws/useRoom";
import { PhoneLobby } from "@/features/lobby/PhoneLobby";
import { PhoneGame } from "@/features/room/PhoneGame";
import { RoomConnecting, RoomDissolved, RoomUnavailable } from "@/features/room/RoomGate";
import { prefetchDetector } from "@/features/recognition/prefetch";

/** 手机房间入口：连接房间，按连接状态与阶段装配大厅或对局页。 */
export function Room() {
  const { code } = useParams<{ code: string }>();
  const roomCode = code?.toUpperCase() ?? null;
  const socket = useRoomConnection(roomCode);
  const room = useRoomStore((s) => s.room);
  const status = useRoomStore((s) => s.status);
  const closedReason = useRoomStore((s) => s.closedReason);
  const playerId = useRoomStore((s) => s.playerId);
  // 进了房间就预热识别模型，牌局开始前下完，结算拍照时不用等
  const joined = room !== null;
  useEffect(() => {
    if (joined) prefetchDetector();
  }, [joined]);

  if (closedReason === "dissolved") return <RoomDissolved code={roomCode} />;
  if (status === "closed" && !room) return <RoomUnavailable code={roomCode} />;
  if (!socket || !room) return <RoomConnecting code={roomCode} />;
  const mySeat = seatOfPlayer(room.seats, playerId);

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
