import { useEffect, useState } from "react";
import type { RoomKind, RoomView } from "@riichi/core";
import { api, ApiError } from "@/api/client";
import { useSession } from "@/api/session";
import { readConsoleRoom, writeConsoleRoom } from "./consoleRooms";

/**
 * 主控台的房间：优先复用本机上次开的这种房型的房间；不存在（404）或已解散（410）则新建。
 * `fresh`（首页点了「新建」）：跳过复用、直接建房。本机记的房间码只在建成之后才替换——
 * 建房失败（断网、5xx、限流）时旧房间的「继续」入口还在。
 */
export function useConsoleRoom(kind: RoomKind, fresh: boolean) {
  const ensure = useSession((s) => s.ensure);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { token } = await ensure();
        const saved = fresh ? null : readConsoleRoom(kind);
        if (saved) {
          try {
            const { room } = await api<{ room: RoomView }>(`/api/rooms/${saved}`, { token });
            // 每种房型各记各的码，正常不会错配；服务端回滚到不认房型的版本时视图没有 kind，一律当四人房
            if ((room.kind ?? "yonma") === kind) {
              if (active) setCode(saved);
              return;
            }
          } catch (err) {
            if (!(err instanceof ApiError && (err.status === 404 || err.status === 410))) throw err;
          }
        }
        if (!active) return;
        const { room } = await api<{ room: RoomView }>("/api/rooms", {
          method: "POST",
          body: { kind },
          token,
        });
        // 服务端回滚到不认房型的版本时会忽略 kind、建出四人房：不记这个码（否则每次进来房型都对不上、再建一个），如实报错
        if ((room.kind ?? "yonma") !== kind) {
          throw new Error("服务端暂不支持这种房型，请稍后再试");
        }
        writeConsoleRoom(kind, room.code);
        if (active) setCode(room.code);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "无法连接服务器");
      }
    })();
    return () => {
      active = false;
    };
  }, [ensure, kind, fresh]);

  return { code, error };
}
