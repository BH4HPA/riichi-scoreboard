import { useEffect, useState } from "react";
import { Link } from "react-router";
import { LogIn } from "lucide-react";
import type { RoomView } from "@riichi/core";
import { api, ApiError } from "@/api/client";
import { useSession } from "@/api/session";
import { Button } from "@/ui/button";
import { clearLastRoom, readLastRoom } from "./lastRoom";

/**
 * 首页的「返回房间」：只在本机已有设备身份且上次的房间仍在时出现。
 * 探测不注册新身份；房间不存在、已解散或身份失效就忘掉它。
 */
export function LastRoomButton() {
  const token = useSession((s) => s.token);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    const saved = readLastRoom();
    if (!token || !saved) return;
    let active = true;
    api<{ room: RoomView }>(`/api/rooms/${saved}`, { token })
      .then(({ room }) => {
        if (active && room.phase !== "closed") setCode(room.code);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && [401, 404, 410].includes(err.status)) clearLastRoom();
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (!code) return null;
  return (
    <Button asChild size="lg" variant="outline" className="w-full">
      <Link to={`/r/${code}`}>
        <LogIn className="h-5 w-5" /> 返回房间{" "}
        <span className="tabular tracking-widest">{code}</span>
      </Link>
    </Button>
  );
}
