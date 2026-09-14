import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Play, Settings2 } from "lucide-react";
import type { RoomView } from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { RulesEditor, RulesSummary } from "@/features/rules/RulesEditor";
import { SeatCards } from "./SeatCards";

export function joinUrl(code: string): string {
  return `${window.location.origin}/r/${code}`;
}

export function ConsoleLobby({ room, onNewRoom }: { room: RoomView; onNewRoom: () => void }) {
  const send = useCommand();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [draft, setDraft] = useState(room.rules);
  const full = room.seats.every((s) => s !== null);
  const allReady = full && room.ready.every(Boolean);
  const url = joinUrl(room.code);

  return (
    <div className="grid min-h-dvh grid-cols-[minmax(320px,2fr)_3fr] gap-8 p-8">
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
        <p className="text-center text-sm text-muted">
          手机扫码加入，四人都点「准备」后自动可开局。
        </p>
      </section>

      <section className="flex flex-col gap-6">
        <div>
          <h2 className="mb-3 text-lg font-semibold">座位</h2>
          <SeatCards seats={room.seats} ready={room.ready} mySeat={null} tv />
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
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
          <RulesSummary rules={room.rules} />
        </div>
        <div className="mt-auto flex items-center gap-3">
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
          <Button size="lg" variant="ghost" className="ml-auto" onClick={onNewRoom}>
            新房间
          </Button>
        </div>
      </section>

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
