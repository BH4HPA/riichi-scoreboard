import { useState } from "react";
import { roundLabel, type Seat } from "@riichi/core";
import { Button } from "@/ui/button";
import { DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { useCloseOnStale } from "../drafts/useCloseOnStale";
import { useMirror } from "@/features/mirror/useMirror";
import { SeatSelect } from "../SeatFlags";
import type { SettlementDialogProps, SettlementFormProps } from "./shared";
import { SettlementDialog } from "./SettlementDialog";

export function ChomboDialog({ open, onOpenChange, game, ...rest }: SettlementDialogProps) {
  return (
    <SettlementDialog
      open={open}
      onOpenChange={onOpenChange}
      title="错和罚符"
      description={`${roundLabel(game.kyoku, game.honba)}，满贯罚符，场况不变`}
    >
      {(onDone) => <ChomboForm game={game} {...rest} onDone={onDone} />}
    </SettlementDialog>
  );
}

function ChomboForm({ names, mirror, mySeat, onDone }: SettlementFormProps) {
  const send = useCommand();
  const submit = useCloseOnStale(onDone);
  const [offender, setOffender] = useState<Seat | null>(mySeat);
  const [busy, setBusy] = useState(false);
  useMirror(
    true,
    {
      kind: "settlement",
      mode: "chombo",
      deltas: null,
      summary: offender === null ? null : `${names[offender]} 错和`,
      loser: offender,
      riichi: [],
      wins: [],
    },
    mirror,
  );
  const confirm = async () => {
    if (offender === null) return;
    setBusy(true);
    const ok = await submit(() => send({ type: "chombo", offender }));
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <>
      <SeatSelect
        label="错和者"
        names={names}
        mySeat={mySeat}
        value={offender}
        onChange={setOffender}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          取消
        </Button>
        <Button variant="danger" onClick={confirm} disabled={busy || offender === null}>
          确认罚符
        </Button>
      </DialogFooter>
    </>
  );
}
