import { useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Play, Settings2, Users } from "lucide-react";
import type { RoomView, Seat } from "@riichi/core";
import { useSession } from "@/api/session";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { RulesEditor } from "@/features/rules/RulesEditor";
import { LocalPlayerDialog } from "./LocalPlayerDialog";
import { localsApi } from "./localsApi";
import { SeatCards } from "./SeatCards";

/** 本设备创建的本地玩家 id 列表（对话框关闭后刷新，用于座位卡上的标记与离座按钮）。 */
function useLocalIds(refreshKey: number): string[] {
  const ensure = useSession((s) => s.ensure);
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    ensure()
      .then(({ token }) => localsApi.list(token))
      .then((list) => active && setIds(list.map((l) => l.id)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ensure, refreshKey]);
  return ids;
}

export function ConsoleLobby({
  room,
  onNewRoom,
  extraActions,
}: {
  room: RoomView;
  onNewRoom: () => void;
  /** 放在底部操作栏右侧的额外按钮（如解散房间） */
  extraActions?: ReactNode;
}) {
  const send = useCommand();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [draft, setDraft] = useState(room.rules);
  const [localSeat, setLocalSeat] = useState<Seat | null>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const [localsVersion, setLocalsVersion] = useState(0);
  const localIds = useLocalIds(localsVersion);
  const full = room.seats.every((s) => s !== null);
  const allReady = full && room.ready.every(Boolean);
  const url = `${window.location.origin}/r/${room.code}`;
  const openLocals = (seat: Seat | null) => {
    setLocalSeat(seat);
    setLocalOpen(true);
  };
  const closeLocals = (open: boolean) => {
    setLocalOpen(open);
    if (!open) setLocalsVersion((v) => v + 1);
  };

  return (
    <div className="grid h-dvh grid-cols-[minmax(320px,2fr)_3fr] gap-8 p-8">
      <section className="flex flex-col items-center justify-center gap-6 rounded-3xl border border-border bg-surface p-8">
        <div className="rounded-2xl bg-white p-4">
          <QRCodeSVG value={url} size={280} level="M" />
        </div>
        <div className="text-center">
          <div className="text-sm text-muted">房间码</div>
          <div className="text-5xl font-semibold tabular tracking-[0.25em]" data-testid="room-code">
            {room.code}
          </div>
          <div className="mt-2 text-sm text-muted">{url}</div>
        </div>
        <p className="text-center text-sm text-muted">手机扫码加入，四人都点「准备」后即可开局。</p>
      </section>

      <section className="flex min-h-0 flex-col gap-6">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">座位</h2>
            <Button variant="ghost" size="sm" onClick={() => openLocals(null)}>
              <Users className="h-4 w-4" /> 本地玩家
            </Button>
          </div>
          <SeatCards
            seats={room.seats}
            ready={room.ready}
            mySeat={null}
            localIds={localIds}
            onAddLocal={openLocals}
            onLeave={(seat) => send({ type: "leave", seat })}
            tv
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">房间规则</h2>
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
            <RulesEditor
              value={room.rules}
              onChange={() => undefined}
              editable={false}
              columns={2}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="lg"
            variant="accent"
            disabled={!allReady}
            onClick={() => send({ type: "start", force: false })}
          >
            <Play className="h-5 w-5" /> 开局
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
      </section>

      <LocalPlayerDialog
        seat={localSeat}
        open={localOpen}
        onOpenChange={closeLocals}
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
