import { createContext, useContext, useEffect, useState } from "react";
import type { ClientCommand } from "@riichi/core";
import { useSession } from "@/api/session";
import { RoomSocket, CommandError } from "./socket";
import { useRoomStore } from "./store";

export const SocketContext = createContext<RoomSocket | null>(null);

export function useSocket(): RoomSocket {
  const socket = useContext(SocketContext);
  if (!socket) throw new Error("SocketContext 缺失");
  return socket;
}

/** 建立并维护到房间的连接；组件卸载时断开。 */
export function useRoomConnection(code: string | null): RoomSocket | null {
  const [socket, setSocket] = useState<RoomSocket | null>(null);
  const ensure = useSession((s) => s.ensure);
  useEffect(() => {
    if (!code) return;
    let active = true;
    let sock: RoomSocket | null = null;
    useRoomStore.getState().set({
      room: null,
      intents: [],
      status: "connecting",
      closedReason: null,
      notice: null,
      autoStartDeadline: null,
    });
    ensure().then(({ token }) => {
      if (!active) return;
      sock = new RoomSocket(code, token);
      sock.connect();
      setSocket(sock);
    });
    return () => {
      active = false;
      sock?.close();
      setSocket(null);
    };
  }, [code, ensure]);
  return socket;
}

/** 发送命令并把错误转成提示；返回是否成功。 */
export function useCommand() {
  const socket = useSocket();
  const notify = useRoomStore((s) => s.notify);
  return async (command: ClientCommand): Promise<boolean> => {
    try {
      await socket.command(command);
      return true;
    } catch (err) {
      notify("error", err instanceof CommandError ? err.message : "操作失败");
      return false;
    }
  };
}
