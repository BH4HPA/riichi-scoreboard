import { useState } from "react";
import { Settings2 } from "lucide-react";
import { presetNameOf, type RoomView, type Seat } from "@riichi/core";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { ProfileEditor } from "@/features/profile/ProfileEditor";
import { RulesEditor, RulesSummary } from "@/features/rules/RulesEditor";
import { useMirror } from "@/features/settlement/useMirror";
import { SeatCards } from "./SeatCards";

export function PhoneLobby({ room, mySeat }: { room: RoomView; mySeat: Seat | null }) {
  const send = useCommand();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [draft, setDraft] = useState(room.rules);
  useMirror(rulesOpen, { kind: "rules" }, true);
  const ready = mySeat !== null && room.ready[mySeat] === true;
  const full = room.seats.every((s) => s !== null);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted">房间</div>
          <div className="text-2xl font-semibold tabular tracking-[0.2em]">{room.code}</div>
        </div>
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

      <div className="rounded-xl border border-border bg-surface p-3">
        <ProfileEditor />
      </div>

      <div>
        <SeatCards
          seats={room.seats}
          ready={room.ready}
          mySeat={mySeat}
          onPick={(seat) => send({ type: "sit", seat })}
          onLeave={(seat) => send({ type: "leave", seat })}
        />
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-1.5 text-xs text-muted">房间规则 · {presetNameOf(room.rules)}</div>
        <RulesSummary rules={room.rules} />
      </div>

      <div className="mt-auto space-y-2">
        {mySeat !== null && (
          <Button
            size="lg"
            variant={ready ? "outline" : "accent"}
            className="w-full"
            onClick={() => send({ type: "setReady", seat: mySeat, ready: !ready })}
          >
            {ready ? "取消准备" : "准备"}
          </Button>
        )}
        {mySeat !== null && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={() => send({ type: "leave", seat: mySeat })}
          >
            离开座位
          </Button>
        )}
        {full && room.ready.every(Boolean) && (
          <p className="text-center text-sm text-muted">全员已准备，等待主控台开局…</p>
        )}
      </div>

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent title="房间规则" description="开局前所有人都可修改；开局后锁定。">
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
