import { useEffect, useState } from "react";
import { ROOM_KINDS, type RoomKind, type RoomView } from "@riichi/core";
import { api, ApiError } from "@/api/client";
import { useSession } from "@/api/session";
import { forgetConsoleRoom, readConsoleRoom } from "./consoleRooms";

/**
 * 本机上次开的某种房型的主控台房间，现在怎么样了：
 * - `none`：本机没记着，或者确认它已经不在了（已忘掉）——点进去一定是新建；
 * - `open`：确认还开着——点进去一定是回到它；
 * - `unknown`：记着一个码但没法确认（正在问、断网、服务端出错）——点进去两种都可能，调用方不要写动词。
 */
export type SavedConsoleRoom =
  { state: "none" } | { state: "open"; code: string } | { state: "unknown" };

/**
 * 供首页决定按钮写「继续」还是「创建」。与手机的「返回房间」（`useLastRoom`）同一套做法：
 * 只在已有设备身份时探测，房间确实没了才忘掉它。
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
  const [probed, setProbed] = useState<Partial<Record<RoomKind, SavedConsoleRoom>>>({});

  useEffect(() => {
    if (!token) return;
    let active = true;
    for (const kind of ROOM_KINDS) {
      const code = saved[kind];
      if (!code) continue;
      api<{ room: RoomView }>(`/api/rooms/${code}`, { token })
        .then(({ room }): SavedConsoleRoom => {
          // 房型对不上（服务端回滚到不认房型的版本）：主控台会另建一个，这个码不会再被用到
          if (room.phase !== "closed" && (room.kind ?? "yonma") === kind) {
            return { state: "open", code };
          }
          return { state: "none" };
        })
        .catch((err: unknown): SavedConsoleRoom => {
          if (err instanceof ApiError && [401, 404, 410].includes(err.status)) {
            forgetConsoleRoom(kind);
            return { state: "none" };
          }
          return { state: "unknown" };
        })
        .then((result) => {
          if (active) setProbed((prev) => ({ ...prev, [kind]: result }));
        });
    }
    return () => {
      active = false;
    };
  }, [token, saved]);

  return Object.fromEntries(
    ROOM_KINDS.map((kind): [RoomKind, SavedConsoleRoom] => {
      // 没有设备身份就没有可回的房间：主控台会先注册、再新建
      if (!saved[kind] || !token) return [kind, { state: "none" }];
      return [kind, probed[kind] ?? { state: "unknown" }];
    }),
  ) as Record<RoomKind, SavedConsoleRoom>;
}
