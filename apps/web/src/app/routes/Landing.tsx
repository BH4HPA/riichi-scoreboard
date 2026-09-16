import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { Monitor, Smartphone } from "lucide-react";
import { deviceKind } from "@/lib/device";
import { Button } from "@/ui/button";
import { JoinPanel } from "@/features/join/JoinPanel";
import { Copyright, IcpRecord } from "@/features/site/SiteFooter";

/**
 * 欢迎页按设备分流：桌面直接进主控台（`?stay=1` 可留在本页）；平板二选一；手机直接进加入面板。
 */
export function Landing() {
  const [params] = useSearchParams();
  const kind = deviceKind();
  const [choice, setChoice] = useState<"join" | null>(null);

  if (kind === "desktop" && params.get("stay") !== "1") return <Navigate to="/console" replace />;
  const showJoin = kind === "phone" || choice === "join";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col justify-center gap-6 pb-10">
        <div>
          <h1 className="text-2xl font-semibold">立直麻将计分板</h1>
          <p className="mt-1 text-sm text-muted">扫描主控台二维码或者输入房间码，加入远程控制。</p>
        </div>
        {showJoin ? (
          <JoinPanel />
        ) : (
          <div className="grid gap-3">
            <Button asChild size="lg" variant="accent" className="h-16 justify-start">
              <Link to="/console">
                <Monitor className="h-5 w-5" /> 打开主控台（电视 / 电脑 / 平板）
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-16 justify-start"
              onClick={() => setChoice("join")}
            >
              <Smartphone className="h-5 w-5" /> 作为玩家加入房间
            </Button>
          </div>
        )}
        {kind !== "phone" && showJoin && (
          <button
            type="button"
            className="text-sm text-muted underline-offset-2 hover:underline"
            onClick={() => setChoice(null)}
          >
            返回选择
          </button>
        )}
        {kind === "phone" && (
          <p className="text-xs text-muted">
            想在这台设备上开主控台？
            <Link to="/console" className="underline">
              点这里
            </Link>
          </p>
        )}
        {/* 低频的开发者向功能，压在小字一档：手机端 showJoin 恒为 true，放进上面的三元就看不见了 */}
        <p className="text-xs text-muted">
          <Link to="/label" className="underline">
            给模型标牌 →
          </Link>
        </p>
      </div>
      <footer className="flex shrink-0 flex-wrap justify-center gap-x-4 gap-y-1">
        <Copyright />
        <IcpRecord />
      </footer>
    </main>
  );
}
