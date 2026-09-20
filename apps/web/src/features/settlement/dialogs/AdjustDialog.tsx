import { useState } from "react";
import { dealerOf, kyokuNumber, kyokuWind, maxKyoku, roundLabel, WIND_LABELS } from "@riichi/core";
import { Button } from "@/ui/button";
import { Input, Label, Select } from "@/ui/controls";
import { DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { useCloseOnStale } from "../drafts/useCloseOnStale";
import { useMirror } from "@/features/mirror/useMirror";
import type { SettlementDialogProps, SettlementFormProps } from "./shared";
import { SettlementDialog } from "./SettlementDialog";

export function AdjustDialog({ open, onOpenChange, ...rest }: SettlementDialogProps) {
  return (
    <SettlementDialog
      open={open}
      onOpenChange={onOpenChange}
      title="调整场况"
      description="手动修正当前场次与本场数，点数不发生变化；庄家随局数确定。"
    >
      {(onDone) => <AdjustForm {...rest} onDone={onDone} />}
    </SettlementDialog>
  );
}

function AdjustForm({ game, names, rules, mirror, onDone }: SettlementFormProps) {
  const send = useCommand();
  const submit = useCloseOnStale(onDone);
  const [wind, setWind] = useState(kyokuWind(game.kyoku));
  const [number, setNumber] = useState(kyokuNumber(game.kyoku));
  const [honba, setHonba] = useState(game.honba);
  const [busy, setBusy] = useState(false);
  useMirror(true, { kind: "adjust" }, mirror);
  const windCount = Math.floor(maxKyoku(rules) / 4) + 1;
  const kyoku = wind * 4 + (number - 1);
  const confirm = async () => {
    setBusy(true);
    const ok = await submit(() => send({ type: "adjust", kyoku, honba }));
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>场风</Label>
          <Select
            value={String(wind)}
            onValueChange={(v) => setWind(Number(v) as 0 | 1 | 2 | 3)}
            options={Array.from({ length: windCount }, (_, i) => ({
              value: String(i),
              label: `${WIND_LABELS[i]}风场`,
            }))}
            className="mt-1"
          />
        </div>
        <div>
          <Label>局数</Label>
          <Input
            type="number"
            min={1}
            max={4}
            value={number}
            onChange={(e) => setNumber(Math.min(4, Math.max(1, Number(e.target.value) || 1)))}
            className="mt-1 tabular"
          />
        </div>
        <div>
          <Label>本场数</Label>
          <Input
            type="number"
            min={0}
            value={honba}
            onChange={(e) => setHonba(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 tabular"
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        调整后：{roundLabel(kyoku, honba)}，庄家 {names[dealerOf(kyoku)]}。此操作可撤销。
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          取消
        </Button>
        <Button onClick={confirm} disabled={busy}>
          确认
        </Button>
      </DialogFooter>
    </>
  );
}
