import { useState, type ReactNode } from "react";
import { Play, Settings2, Users } from "lucide-react";
import { presetNameOf, type RoomView, type Seat } from "@riichi/core";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useRoomStore } from "@/ws/store";
import { useCommand } from "@/ws/useRoom";
import { cn } from "@/lib/utils";
import { RoomQr, RoomQrDialog } from "@/features/console/RoomQr";
import { RulesEditor } from "@/features/rules/RulesEditor";
import { SiteFooter } from "@/features/site/SiteFooter";
import { LocalPlayerDialog } from "./LocalPlayerDialog";
import { SeatCards } from "./SeatCards";
import { useCountdown } from "./useCountdown";

/**
 * 主控台大厅。宽屏：左栏二维码、右栏座位 + 规则；
 * 窄屏（Pad）：单栏，二维码放弹窗（首次进入自动弹出一次）。
 */
export function ConsoleLobby({
  room,
  wide,
  onNewRoom,
  extraActions,
}: {
  room: RoomView;
  wide: boolean;
  onNewRoom: () => void;
  /** 放在底部操作栏右侧的额外按钮（如解散房间） */
  extraActions?: ReactNode;
}) {
  const send = useCommand();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [draft, setDraft] = useState(room.rules);
  const [localSeat, setLocalSeat] = useState<Seat | null>(null);
  const [localOpen, setLocalOpen] = useState(false);
  // 窄屏首次进入大厅自动展示二维码；房间码变了再弹一次
  const [qrShownFor, setQrShownFor] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  if (!wide && qrShownFor !== room.code) {
    setQrShownFor(room.code);
    setQrOpen(true);
  }
  const full = room.seats.every((s) => s !== null);
  const allReady = full && room.ready.every(Boolean);
  const countdown = useCountdown(useRoomStore((s) => s.autoStartDeadline));
  const openLocals = (seat: Seat | null) => {
    setLocalSeat(seat);
    setLocalOpen(true);
  };

  const seats = (
    <SeatCards
      seats={room.seats}
      ready={room.ready}
      online={room.online}
      mySeat={null}
      onAddLocal={openLocals}
      onLeave={(seat) => send({ type: "leave", seat })}
      tv={wide}
    />
  );
  const rulesCard = (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          房间规则
          <Badge tone="outline">{presetNameOf(room.rules)}</Badge>
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(room.rules);
            setRulesOpen(true);
          }}
        >
          <Settings2 className="h-4 w-4" /> 修改规则
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RulesEditor value={room.rules} onChange={() => undefined} editable={false} columns={2} />
      </div>
    </div>
  );
  const actions = (
    <div className="flex items-center gap-3">
      <Button
        size="lg"
        variant="accent"
        disabled={!allReady}
        onClick={() => send({ type: "start", force: false })}
      >
        <Play className="h-5 w-5" /> 开局
        {countdown !== null && <span className="tabular">· {countdown}</span>}
      </Button>
      <Button
        size="lg"
        variant="outline"
        disabled={!full}
        onClick={() => send({ type: "start", force: true })}
      >
        强制开局
      </Button>
      <span className="ml-auto flex items-center gap-2">
        {extraActions}
        <Button size="lg" variant="ghost" onClick={onNewRoom}>
          新房间
        </Button>
      </span>
    </div>
  );

  return (
    <div
      className={cn(
        "h-dvh",
        wide ? "grid grid-cols-[minmax(320px,2fr)_3fr] gap-8 p-8" : "flex flex-col gap-4 p-4",
      )}
    >
      {wide ? (
        <section className="flex flex-col rounded-3xl border border-border bg-surface p-8">
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <RoomQr code={room.code} size={240} />
            <p className="text-center text-sm text-muted">
              手机扫码加入，四人都点「准备」后即可开局。
            </p>
          </div>
          <SiteFooter />
        </section>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            房间码{" "}
            <span className="text-lg font-semibold tabular tracking-[0.2em] text-fg">
              {room.code}
            </span>
          </span>
          <RoomQrDialog code={room.code} open={qrOpen} onOpenChange={setQrOpen} />
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => openLocals(null)}>
            <Users className="h-4 w-4" /> 本地玩家
          </Button>
        </div>
      )}

      <section className="flex min-h-0 flex-1 flex-col gap-4">
        <div>
          {wide && (
            <div className="mb-2 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => openLocals(null)}>
                <Users className="h-4 w-4" /> 本地玩家
              </Button>
            </div>
          )}
          {seats}
        </div>
        {rulesCard}
        {actions}
      </section>
      {!wide && <SiteFooter className="shrink-0" />}

      <LocalPlayerDialog
        seat={localSeat}
        open={localOpen}
        onOpenChange={setLocalOpen}
        seatedIds={room.seats.flatMap((s) => (s ? [s.id] : []))}
        onSit={(seat, playerId) => send({ type: "sitLocal", seat, playerId })}
      />

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent
          title="房间规则"
          description="开局前可修改；开局后锁定。"
          className="sm:max-w-2xl"
        >
          <RulesEditor value={draft} onChange={setDraft} editable />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRulesOpen(false)}>
              取消
            </Button>
            <Button
              variant="accent"
              onClick={async () => {
                if (await send({ type: "setRules", rules: draft })) setRulesOpen(false);
              }}
            >
              应用规则
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
