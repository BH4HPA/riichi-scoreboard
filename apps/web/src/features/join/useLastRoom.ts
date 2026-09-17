import { useEffect, useState } from "react";
import type { RoomView } from "@riichi/core";
import { api, ApiError } from "@/api/client";
import { useSession } from "@/api/session";
import { clearLastRoom, readLastRoom } from "./lastRoom";

/**
 * 上次进过、现在仍然开着的房间。
 * `pending`：本机记着一个房间、正在向服务端确认——调用方据此先按「有房间」排版（占位、扫码不高亮），
 * 免得确认回来时插入按钮把页面顶下去、扫码按钮从高亮褪成描边。
 * 只在本机已有设备身份时探测，不为此注册新身份；房间不存在、已解散或身份失效就忘掉它。
 */
export function useLastRoom(): { code: string | null; pending: boolean } {
  const token = useSession((s) => s.token);
  const [saved] = useState(readLastRoom);
  const [code, setCode] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token || !saved) return;
    let active = true;
    api<{ room: RoomView }>(`/api/rooms/${saved}`, { token })
      .then(({ room }) => {
        if (active && room.phase !== "closed") setCode(room.code);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && [401, 404, 410].includes(err.status)) clearLastRoom();
      })
      .finally(() => {
        if (active) setDone(true);
      });
    return () => {
      active = false;
    };
  }, [token, saved]);

  return { code, pending: Boolean(token && saved) && !done };
}
