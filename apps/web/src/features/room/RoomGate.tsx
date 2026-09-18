import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Wifi } from "lucide-react";
import { Button } from "@/ui/button";
import type { ClosedReason } from "@/ws/store";

const SLOW_CONNECT_MS = 8000;

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

const UNAVAILABLE: Record<Exclude<ClosedReason, "dissolved">, [string, string]> = {
  unauthorized: ["设备身份已失效", "请回首页重新扫码或输入房间码加入。"],
  offline: ["无法连接服务器", "请检查网络后重试；网络恢复后回首页重新进入房间。"],
  not_found: ["房间不存在", "房间码可能输错了，或房间已被关闭；回首页重新扫码或输入房间码。"],
};

/** 连接被服务端终止（房间不存在 / 设备身份失效），或根本没连上服务器。 */
export function RoomUnavailable({
  code,
  reason,
}: {
  code: string | null;
  reason: Exclude<ClosedReason, "dissolved"> | null;
}) {
  const [title, hint] = UNAVAILABLE[reason ?? "not_found"];
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-semibold">
        {reason === "not_found" || reason === null ? `房间 ${code} 不存在` : title}
      </p>
      <p className="text-sm text-muted">{hint}</p>
      <Button asChild variant="outline">
        <Link to="/">返回首页</Link>
      </Button>
    </div>
  );
}

/** 连接中：超过一段时间还没连上，给一个回首页的出口（网络恢复后仍会自动连上）。 */
export function RoomConnecting({ code }: { code: string | null }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="flex items-center gap-2 text-muted">
        <Wifi className="h-5 w-5 animate-pulse" /> 正在连接房间 {code}…
      </p>
      {slow && (
        <Button asChild variant="outline">
          <Link to="/">返回首页</Link>
        </Button>
      )}
    </div>
  );
}
