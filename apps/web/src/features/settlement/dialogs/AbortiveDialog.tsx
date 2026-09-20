import { useState } from "react";
import { roundLabel, type AbortiveReason } from "@riichi/core";
import { Button } from "@/ui/button";
import { Label, Select } from "@/ui/controls";
import { DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { useCloseOnStale } from "../drafts/useCloseOnStale";
import { useMirror } from "@/features/mirror/useMirror";
import { seatsOf } from "../format";
import { useSeededRiichi } from "../riichiSeed";
import { SeatFlags } from "../SeatFlags";
import type { SettlementDialogProps, SettlementFormProps } from "./shared";
import { SettlementDialog } from "./SettlementDialog";

const ABORTIVE_OPTIONS: Array<{ value: AbortiveReason; label: string }> = [
  { value: "kyuushu", label: "九种九牌" },
  { value: "suufon", label: "四风连打" },
  { value: "suucha", label: "四家立直" },
  { value: "suukan", label: "四杠散了" },
  { value: "sanchahou", label: "三家和了" },
];

export function AbortiveDialog({ open, onOpenChange, game, ...rest }: SettlementDialogProps) {
  return (
    <SettlementDialog
      open={open}
      onOpenChange={onOpenChange}
      title="途中流局"
      description={`${roundLabel(game.kyoku, game.honba)}，庄家连庄，本场 +1`}
    >
      {(onDone) => <AbortiveForm game={game} {...rest} onDone={onDone} />}
    </SettlementDialog>
  );
}

function AbortiveForm({ game, names, mirror, mySeat, onDone }: SettlementFormProps) {
  const send = useCommand();
  const submit = useCloseOnStale(onDone);
  const [reason, setReason] = useState<AbortiveReason>("kyuushu");
  const [riichi, setRiichi] = useSeededRiichi(game.riichi);
  const [busy, setBusy] = useState(false);
  const deltas = riichi.map((r) => (r ? -1000 : 0));
  useMirror(
    true,
    {
      kind: "settlement",
      mode: "abortive",
      deltas,
      summary: ABORTIVE_OPTIONS.find((o) => o.value === reason)?.label ?? null,
      loser: null,
      riichi: seatsOf(riichi),
      wins: [],
    },
    mirror,
  );
  const confirm = async () => {
    setBusy(true);
    const ok = await submit(() => send({ type: "abortive", reason, riichi: seatsOf(riichi) }));
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <>
      <div className="space-y-3">
        <div>
          <Label>原因</Label>
          <Select
            value={reason}
            onValueChange={setReason}
            options={ABORTIVE_OPTIONS}
            className="mt-1"
          />
        </div>
        <SeatFlags
          label="已宣告立直（立直棒留在场上）"
          names={names}
          mySeat={mySeat}
          value={riichi}
          onChange={setRiichi}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          取消
        </Button>
        <Button variant="accent" onClick={confirm} disabled={busy}>
          确认
        </Button>
      </DialogFooter>
    </>
  );
}
