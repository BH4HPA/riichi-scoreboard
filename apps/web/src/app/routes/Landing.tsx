import { useState } from "react";
import { RECOGNITION_MODEL } from "@/features/recognition/modelUrl";
import { Link } from "react-router";
import { Smartphone } from "lucide-react";
import { deviceKind } from "@/lib/device";
import { Button } from "@/ui/button";
import { RoomKindPicker } from "@/features/console/RoomKindPicker";
import { JoinPanel } from "@/features/join/JoinPanel";
import { SiteFooter } from "@/features/site/SiteFooter";

/**
 * 欢迎页按设备分流：电脑与平板先选「开哪种房间」（也可以作为玩家加入）；手机直接进加入面板，
 * 想在手机上开主控台再展开同一组选择。
 */
export function Landing() {
  const phone = deviceKind() === "phone";
  const [choice, setChoice] = useState<"join" | "console" | null>(null);
  const showJoin = choice === "join" || (phone && choice === null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col justify-center gap-6 pb-10">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
            立直麻将计分板
          </h1>
          <p className="mt-1 text-sm text-muted">
            {showJoin
              ? "扫描主控台二维码或者输入房间码，加入远程控制。"
              : "在电视、电脑或平板上开一个房间，手机扫码加入。"}
          </p>
        </div>
        {showJoin ? (
          <JoinPanel />
        ) : (
          <div className="grid gap-3">
            <RoomKindPicker />
            {!phone && (
              <Button
                size="lg"
                variant="outline"
                className="h-16 justify-start"
                onClick={() => setChoice("join")}
              >
                <Smartphone className="h-5 w-5" /> 作为玩家加入房间
              </Button>
            )}
          </div>
        )}
        {choice !== null && (
          <button
            type="button"
            className="text-sm text-muted underline-offset-2 hover:underline"
            onClick={() => setChoice(null)}
          >
            {phone ? "返回加入房间" : "返回选择"}
          </button>
        )}
        {/* 次要入口压在小字一档，成组放、与上方面板拉开 */}
        <div className="mt-4 space-y-2 text-xs text-muted">
          {RECOGNITION_MODEL && (
            <p>
              <Link to="/calc" className="underline">
                拍照算点数 →
              </Link>
            </p>
          )}
          {phone && choice === null && (
            <p>
              想在这台设备上开主控台？
              <button type="button" className="underline" onClick={() => setChoice("console")}>
                点这里
              </button>
            </p>
          )}
        </div>
      </div>
      <SiteFooter className="shrink-0 justify-center" />
    </main>
  );
}
