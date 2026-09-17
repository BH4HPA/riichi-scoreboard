import { useState } from "react";
import {
  dealerOf,
  formatDiff,
  kyokuNumber,
  kyokuWind,
  maxKyoku,
  roundLabel,
  WIND_LABELS,
  type AbortiveReason,
  type GameState,
  type RoomRules,
  type Seat,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { Input, Label, Select } from "@/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { PreviewGrid } from "./PreviewGrid";
import { NO_FLAGS, drawKyotakuText, seatsOf } from "./format";
import { previewDraw } from "./preview";
import { SeatFlags, SeatSelect } from "./SeatFlags";
import { useMirror } from "./useMirror";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: GameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
}

interface FormProps {
  game: GameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
  onDone: () => void;
}

/** 结算类对话框额外带操作者座位：默认选人与相对方位标注都以它为视角；主控台为 null。 */
type Seated = { mySeat: Seat | null };

function description(game: GameState, names: string[]): string {
  return `${roundLabel(game.kyoku, game.honba)}，庄家：${names[dealerOf(game.kyoku)]}`;
}

export function DrawDialog({
  open,
  onOpenChange,
  game,
  names,
  rules,
  mirror,
  mySeat,
}: DialogProps & Seated) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="流局结算" description={description(game, names)}>
        <DrawForm
          game={game}
          names={names}
          rules={rules}
          mirror={mirror}
          mySeat={mySeat}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function DrawForm({ game, names, rules, mirror, onDone }: FormProps & Seated) {
  const send = useCommand();
  const [tenpai, setTenpai] = useState(NO_FLAGS);
  const [riichi, setRiichi] = useState(NO_FLAGS);
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
        <SeatFlags label="听牌情况" names={names} value={tenpai} onChange={setTenpai} />
        <SeatFlags label="立直情况" names={names} value={riichi} onChange={setRiichi} />
        {rules.hand.nagashiMangan && (
          <SeatFlags label="流局满贯" names={names} value={nagashi} onChange={setNagashi} />
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

const ABORTIVE_OPTIONS: Array<{ value: AbortiveReason; label: string }> = [
  { value: "kyuushu", label: "九种九牌" },
  { value: "suufon", label: "四风连打" },
  { value: "suucha", label: "四家立直" },
  { value: "suukan", label: "四杠散了" },
  { value: "sanchahou", label: "三家和了" },
];

export function AbortiveDialog({
  open,
  onOpenChange,
  game,
  names,
  rules,
  mirror,
  mySeat,
}: DialogProps & Seated) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="途中流局"
        description={`${roundLabel(game.kyoku, game.honba)}，庄家连庄，本场 +1`}
      >
        <AbortiveForm
          game={game}
          names={names}
          rules={rules}
          mirror={mirror}
          mySeat={mySeat}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AbortiveForm({ names, mirror, onDone }: FormProps & Seated) {
  const send = useCommand();
  const [reason, setReason] = useState<AbortiveReason>("kyuushu");
  const [riichi, setRiichi] = useState(NO_FLAGS);
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
    const ok = await send({ type: "abortive", reason, riichi: seatsOf(riichi) });
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

export function ChomboDialog({
  open,
  onOpenChange,
  game,
  names,
  rules,
  mirror,
  mySeat,
}: DialogProps & Seated) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="错和罚符"
        description={`${roundLabel(game.kyoku, game.honba)}，满贯罚符，场况不变`}
      >
        <ChomboForm
          game={game}
          names={names}
          rules={rules}
          mirror={mirror}
          mySeat={mySeat}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ChomboForm({ names, mirror, mySeat, onDone }: FormProps & Seated) {
  const send = useCommand();
  const [offender, setOffender] = useState<Seat>(mySeat ?? 0);
  const [busy, setBusy] = useState(false);
  useMirror(
    true,
    {
      kind: "settlement",
      mode: "chombo",
      deltas: null,
      summary: `${names[offender]} 错和`,
      loser: offender,
      riichi: [],
      wins: [],
    },
    mirror,
  );
  const confirm = async () => {
    setBusy(true);
    const ok = await send({ type: "chombo", offender });
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <>
      <SeatSelect label="错和者" names={names} value={offender} onChange={setOffender} />
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          取消
        </Button>
        <Button variant="danger" onClick={confirm} disabled={busy}>
          确认罚符
        </Button>
      </DialogFooter>
    </>
  );
}

export function AdjustDialog({ open, onOpenChange, game, names, rules, mirror }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="调整场况"
        description="手动修正当前场次与本场数，点数不发生变化；庄家随局数确定。"
      >
        <AdjustForm
          game={game}
          names={names}
          rules={rules}
          mirror={mirror}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({ game, names, rules, mirror, onDone }: FormProps) {
  const send = useCommand();
  const [wind, setWind] = useState(kyokuWind(game.kyoku));
  const [number, setNumber] = useState(kyokuNumber(game.kyoku));
  const [honba, setHonba] = useState(game.honba);
  const [busy, setBusy] = useState(false);
  useMirror(true, { kind: "adjust" }, mirror);
  const windCount = Math.floor(maxKyoku(rules) / 4) + 1;
  const kyoku = wind * 4 + (number - 1);
  const confirm = async () => {
    setBusy(true);
    const ok = await send({ type: "adjust", kyoku, honba });
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

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description: text,
  confirmText,
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string;
  danger?: boolean;
  onConfirm: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} className="sm:max-w-sm">
        <p className="text-sm text-muted">{text}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant={danger ? "danger" : "accent"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await onConfirm();
              setBusy(false);
              if (ok) onOpenChange(false);
            }}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
