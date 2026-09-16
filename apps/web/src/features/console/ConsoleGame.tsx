import { useState } from "react";
import { History, PanelRightOpen } from "lucide-react";
import type { GameView, RoomView, UiState } from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { ConnectionBadge } from "@/ui/notice";
import { DissolveButton } from "./DissolveButton";
import { RoomQrDialog } from "./RoomQr";
import { RoundHeader } from "@/features/scoreboard/RoundHeader";
import { PointsGrid } from "@/features/scoreboard/PointsGrid";
import { DiffMatrix } from "@/features/scoreboard/DiffMatrix";
import { HistoryTable } from "@/features/history/HistoryTable";
import { FinalPanel } from "@/features/final/FinalPanel";
import { ControlPanel } from "@/features/settlement/ControlPanel";
import { MirrorOverlay } from "@/features/mirror/MirrorOverlay";
import { SiteFooter } from "@/features/site/SiteFooter";

/** 主控台对局页：宽屏双栏（左记分右历史），窄屏（Pad）单栏 + 历史抽屉 + 二维码弹窗。 */
export function ConsoleGame({
  room,
  game,
  names,
  intents,
  wide,
}: {
  room: RoomView;
  game: GameView;
  names: string[];
  intents: UiState[];
  wide: boolean;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  return (
    <div className={wide ? "flex h-dvh flex-col gap-4 p-6" : "flex min-h-dvh flex-col gap-3 p-4"}>
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <RoundHeader game={game.present} names={names} rules={room.rules} tv={wide} />
        </div>
        <ConnectionBadge />
        {wide ? (
          <span className="text-sm text-muted">
            房间 <span className="font-semibold tabular text-fg">{room.code}</span>
          </span>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4" /> 记录 {game.present.history.length}
            </Button>
            <RoomQrDialog code={room.code} open={qrOpen} onOpenChange={setQrOpen} />
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => setPanelOpen(true)}>
          <PanelRightOpen className="h-4 w-4" /> 操作
        </Button>
      </header>

      <main
        className={wide ? "grid min-h-0 flex-1 grid-cols-[2fr_3fr] gap-4" : "flex flex-col gap-3"}
      >
        <div className={wide ? "flex min-h-0 flex-col gap-2" : "contents"}>
          <div className={wide ? "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto" : "contents"}>
            <PointsGrid
              game={game.present}
              seats={room.seats}
              names={names}
              rules={room.rules}
              tv={wide}
            />
            <MirrorOverlay intents={intents} names={names} rules={room.rules} />
            {game.present.status === "finished" && (
              <div className="rounded-xl border border-pos/40 bg-surface p-4">
                <h2 className="mb-2 text-lg font-semibold">终局结算</h2>
                <FinalPanel
                  game={game.present}
                  seats={room.seats}
                  names={names}
                  rules={room.rules}
                  tv={wide}
                />
              </div>
            )}
            <div className="rounded-xl border border-border bg-surface p-3">
              <DiffMatrix game={game.present} names={names} rules={room.rules} tv={wide} />
            </div>
          </div>
          {wide && <SiteFooter className="shrink-0" />}
        </div>
        {wide && (
          <div className="min-h-0 overflow-y-auto rounded-xl border border-border bg-surface p-3">
            <HistoryTable history={game.present.history} tv />
          </div>
        )}
      </main>
      {/* 窄屏整页滚动：页脚贴在屏幕底部，内容超一屏时跟在最后 */}
      {!wide && <SiteFooter className="mt-auto pt-2" />}

      {!wide && (
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent
            side="right"
            title="历史记录"
            description={`共 ${game.present.history.length} 条`}
          >
            <HistoryTable history={game.present.history} />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent
          title="主控台操作"
          description="也可以用手机远程操作。"
          className="sm:max-w-2xl"
        >
          <ControlPanel
            game={game}
            names={names}
            rules={room.rules}
            mirror={false}
            mySeat={null}
            size="lg"
            roomActions={<DissolveButton code={room.code} size="lg" variant="danger" />}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
