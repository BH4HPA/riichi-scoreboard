import { Link } from "react-router";
import { Wifi } from "lucide-react";
import { Button } from "@/ui/button";

/** 房间已被主控台解散。 */
export function RoomDissolved({ code }: { code: string | null }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-semibold">房间 {code} 已解散</p>
      <p className="text-sm text-muted">主控台已解散这个房间，请扫描新的二维码加入。</p>
      <Button asChild variant="outline">
        <Link to="/">返回首页</Link>
      </Button>
    </div>
  );
}

/** 连接被服务端终止（房间不存在或身份无效）。 */
export function RoomUnavailable({ code }: { code: string | null }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 text-center text-neg">
      房间 {code} 不存在或连接被拒绝
    </div>
  );
}

export function RoomConnecting({ code }: { code: string | null }) {
  return (
    <div className="flex min-h-dvh items-center justify-center gap-2 text-muted">
      <Wifi className="h-5 w-5 animate-pulse" /> 正在连接房间 {code}…
    </div>
  );
}
