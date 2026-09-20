import { useState, type ReactNode } from "react";
import { History, PanelRightOpen } from "lucide-react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { ConnectionBadge } from "@/ui/notice";
import { RoomQrDialog } from "./RoomQr";
import { HANDLE_PX } from "./split/clampSplit";
import { SplitHandle } from "./split/SplitHandle";
import { useSplit } from "./split/useSplit";
import { SiteBrand, SiteFooter } from "@/features/site/SiteFooter";

/**
 * 主控台对局页的壳：宽屏双栏（左记分右侧栏，中间可拖动），窄屏（Pad）单栏 + 历史抽屉；两者都有二维码弹窗与操作面板。
 * 与对局模型无关——记分区、侧栏、历史、操作按钮都由各房型的对局页填进来。
 */
export function ConsoleGameShell({
  code,
  wide,
  header,
  children,
  aside,
  history,
  historyCount,
  panel,
}: {
  code: string;
  wide: boolean;
  /** 页头左侧：局况 */
  header: ReactNode;
  /** 记分区（左栏 / 窄屏主体） */
  children: ReactNode;
  /** 宽屏右栏 */
  aside: ReactNode;
  /** 窄屏历史抽屉的内容 */
  history: ReactNode;
  historyCount: number;
  /** 操作面板的内容；打开子对话框前调用 `close` 收起面板（同时只留一层） */
  panel: (close: () => void) => ReactNode;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const { attach, ratio, ratioAt, set: setRatio } = useSplit();
  return (
    <div className={wide ? "flex h-dvh flex-col gap-4 p-6" : "flex min-h-dvh flex-col gap-3 p-4"}>
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">{header}</div>
        <ConnectionBadge />
        {wide ? (
          <span className="text-sm text-muted">
            房间 <span className="font-semibold tabular text-fg">{code}</span>
          </span>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4" /> 记录 {historyCount}
          </Button>
        )}
        {/* 开局后还有人要加入（换手机、断线重进）：两种屏宽都能再打开二维码 */}
        <RoomQrDialog code={code} open={qrOpen} onOpenChange={setQrOpen} />
        <Button variant="outline" size="sm" onClick={() => setPanelOpen(true)}>
          <PanelRightOpen className="h-4 w-4" /> 操作
        </Button>
      </header>

      <main
        ref={attach}
        className={wide ? "grid min-h-0 flex-1" : "flex flex-col gap-3"}
        style={
          wide ? { gridTemplateColumns: `${ratio}fr ${HANDLE_PX}px ${1 - ratio}fr` } : undefined
        }
      >
        <div className={wide ? "flex min-h-0 flex-col gap-2" : "contents"}>
          <div className={wide ? "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto" : "contents"}>
            {children}
          </div>
          {wide && (
            <div className="flex shrink-0 items-center justify-between gap-4">
              <SiteFooter />
              <SiteBrand className="shrink-0" />
            </div>
          )}
        </div>
        {wide && <SplitHandle ratio={ratio} ratioAt={ratioAt} onChange={setRatio} />}
        {wide && (
          <div className="min-h-0 overflow-y-auto rounded-xl border border-border bg-surface p-3">
            {aside}
          </div>
        )}
      </main>
      {/* 窄屏整页滚动：站名 + 页脚贴在屏幕底部，内容超一屏时跟在最后 */}
      {!wide && (
        <div className="mt-auto flex flex-col items-center gap-2 pt-2">
          <SiteBrand />
          <SiteFooter className="justify-center" />
        </div>
      )}

      {!wide && (
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent side="right" title="历史记录" description={`共 ${historyCount} 条`}>
            {history}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent
          title="主控台操作"
          description="也可以用手机远程操作。"
          className="sm:max-w-2xl"
        >
          {panel(() => setPanelOpen(false))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
