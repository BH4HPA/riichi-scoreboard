import { useCallback, useEffect, useState } from "react";
import type { RoomView } from "@riichi/core";
import { api, ApiError } from "@/api/client";
import { useSession } from "@/api/session";

const ROOM_KEY = "riichi.console.room";

/**
 * 主控台的房间：优先复用本机上次的房间码；不存在（404）或已解散（410）则新建。
 * `newRoom` 供「新房间」按钮与解散后的自动重建使用。
 */
export function useConsoleRoom() {
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
            if (!(err instanceof ApiError && (err.status === 404 || err.status === 410))) throw err;
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
