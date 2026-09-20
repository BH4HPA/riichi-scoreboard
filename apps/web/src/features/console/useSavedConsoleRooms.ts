import { useEffect, useState } from "react";
import { ROOM_KINDS, type RoomKind, type RoomView } from "@riichi/core";
import { api, ApiError } from "@/api/client";
import { useSession } from "@/api/session";
import { forgetConsoleRoom, readConsoleRoom } from "./consoleRooms";

export interface SavedConsoleRoom {
  /** 仍然开着的房间码；没有则为 null */
  code: string | null;
  /** 本机记着一个码、正在向服务端确认：调用方先按「有房间」排版，免得确认回来时按钮换文案、页面跳动 */
  pending: boolean;
}

/**
 * 本机上次开的、现在仍然开着的主控台房间（每种房型一个），供首页决定按钮写「继续」还是「创建」。
 * 与手机的「返回房间」（`useLastRoom`）同一套做法：只在已有设备身份时探测，房间没了就忘掉它。
 */
export function useSavedConsoleRooms(): Record<RoomKind, SavedConsoleRoom> {
  const token = useSession((s) => s.token);
  const [saved] = useState(
    () =>
      Object.fromEntries(ROOM_KINDS.map((k) => [k, readConsoleRoom(k)])) as Record<
        RoomKind,
        string | null
      >,
  );
  const [alive, setAlive] = useState<Partial<Record<RoomKind, string | null>>>({});

  useEffect(() => {
    if (!token) return;
    let active = true;
    for (const kind of ROOM_KINDS) {
      const code = saved[kind];
      if (!code) continue;
      api<{ room: RoomView }>(`/api/rooms/${code}`, { token })
        .then(({ room }) =>
          room.phase !== "closed" && (room.kind ?? "yonma") === kind ? code : null,
        )
        .catch((err: unknown) => {
          if (err instanceof ApiError && [401, 404, 410].includes(err.status)) {
            forgetConsoleRoom(kind);
          }
          return null;
        })
        .then((result) => {
          if (active) setAlive((prev) => ({ ...prev, [kind]: result }));
        });
    }
    return () => {
      active = false;
    };
  }, [token, saved]);

  return Object.fromEntries(
    ROOM_KINDS.map((kind) => [
      kind,
      {
        code: alive[kind] ?? null,
        pending: Boolean(token && saved[kind]) && !(kind in alive),
      },
    ]),
  ) as Record<RoomKind, SavedConsoleRoom>;
}
