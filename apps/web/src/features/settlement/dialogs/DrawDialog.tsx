import { useState } from "react";
import { formatDiff } from "@riichi/core";
import { Button } from "@/ui/button";
import { Label } from "@/ui/controls";
import { DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { useMirror } from "@/features/mirror/useMirror";
import { drawKyotakuText, NO_FLAGS, seatsOf } from "../format";
import { previewDraw } from "../preview";
import { PreviewGrid } from "../PreviewGrid";
import { useSeededRiichi } from "../riichiSeed";
import { SeatFlags } from "../SeatFlags";
import { roundDescription, type SettlementDialogProps, type SettlementFormProps } from "./shared";
import { SettlementDialog } from "./SettlementDialog";

export function DrawDialog({ open, onOpenChange, game, names, ...rest }: SettlementDialogProps) {
  return (
    <SettlementDialog
      open={open}
      onOpenChange={onOpenChange}
      title="流局结算"
      description={roundDescription(game, names)}
    >
      {(onDone) => <DrawForm game={game} names={names} {...rest} onDone={onDone} />}
    </SettlementDialog>
  );
}

function DrawForm({ game, names, rules, mirror, mySeat, onDone }: SettlementFormProps) {
  const send = useCommand();
  const [tenpai, setTenpai] = useState(NO_FLAGS);
  const [riichi, setRiichi] = useSeededRiichi(game.riichi);
  const [nagashi, setNagashi] = useState(NO_FLAGS);
  const [busy, setBusy] = useState(false);
  const preview = previewDraw(game, rules, tenpai, seatsOf(riichi), seatsOf(nagashi));
  const summary = `听牌：${
    seatsOf(tenpai)
      .map((s) => names[s])
      .join("、") || "无"
  }${preview.nagashi.length ? `；流局满贯：${preview.nagashi.map((s) => names[s]).join("、")}` : ""}；本局立直棒 ${formatDiff(preview.riichiIncome)} 点计入场供`;
  useMirror(
    true,
    {
      kind: "settlement",
      mode: "draw",
      deltas: preview.deltas,
      summary,
      loser: null,
      riichi: seatsOf(riichi),
      wins: [],
    },
    mirror,
  );

  const confirm = async () => {
    setBusy(true);
    const ok = await send({
      type: "draw",
      tenpai,
      riichi: seatsOf(riichi),
      nagashi: seatsOf(nagashi),
    });
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <>
      <div className="space-y-3">
        <SeatFlags
          label="听牌情况"
          names={names}
          mySeat={mySeat}
          value={tenpai}
          onChange={setTenpai}
        />
        <SeatFlags
          label="立直情况"
          names={names}
          mySeat={mySeat}
          value={riichi}
          onChange={setRiichi}
        />
        {rules.hand.nagashiMangan && (
          <SeatFlags
            label="流局满贯"
            names={names}
            mySeat={mySeat}
            value={nagashi}
            onChange={setNagashi}
          />
        )}
        <div>
          <Label>结算预览</Label>
          <PreviewGrid deltas={preview.deltas} names={names} className="mt-1" />
          <p className="mt-2 text-sm">
            本局立直棒计入场供：
            <span className={preview.riichiIncome > 0 ? "font-semibold text-accent" : "text-muted"}>
              {formatDiff(preview.riichiIncome)}
            </span>{" "}
            点
          </p>
          <p className="text-xs text-muted">
            {drawKyotakuText(game.kyotaku, game.kyotaku + seatsOf(riichi).length)}
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          取消
        </Button>
        <Button variant="accent" onClick={confirm} disabled={busy}>
          确认流局
        </Button>
      </DialogFooter>
    </>
  );
}
