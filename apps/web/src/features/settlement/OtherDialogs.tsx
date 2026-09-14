import { useMemo, useState } from "react";
import {
  formatDiff,
  kyokuNumber,
  kyokuWind,
  maxKyoku,
  roundLabel,
  SEATS,
  WIND_LABELS,
  type AbortiveReason,
  type GameState,
  type RoomRules,
  type Seat,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { CheckRow, Input, Label, Select } from "@/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import { PreviewGrid } from "./PreviewGrid";
import { previewDraw } from "./preview";
import { useMirror } from "./useMirror";
import { drawKyotakuText } from "./WinDialogs";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: GameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
}

const seatsOf = (flags: boolean[]) => SEATS.filter((s) => flags[s]);

function SeatFlags({
  label,
  names,
  value,
  onChange,
}: {
  label: string;
  names: string[];
  value: boolean[];
  onChange: (v: boolean[]) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        {SEATS.map((s) => (
          <CheckRow
            key={s}
            checked={value[s]!}
            onCheckedChange={(v) => onChange(value.map((x, i) => (i === s ? v : x)))}
          >
            {names[s]}
          </CheckRow>
        ))}
      </div>
    </div>
  );
}

export function DrawDialog({ open, onOpenChange, game, names, rules, mirror }: DialogProps) {
  const send = useCommand();
  const [tenpai, setTenpai] = useState([false, false, false, false]);
  const [riichi, setRiichi] = useState([false, false, false, false]);
  const [nagashi, setNagashi] = useState([false, false, false, false]);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(
    () => previewDraw(rules, tenpai, seatsOf(riichi)),
    [rules, tenpai, riichi],
  );
  const summary = `听牌：${
    seatsOf(tenpai)
      .map((s) => names[s])
      .join("、") || "无"
  }；本局立直供托 ${formatDiff(preview.riichiIncome)} 点`;
  useMirror(open, { kind: "settlement", mode: "draw", deltas: preview.deltas, summary }, mirror);

  const confirm = async () => {
    setBusy(true);
    const ok = await send({
      type: "draw",
      tenpai,
      riichi: seatsOf(riichi),
      nagashi: seatsOf(nagashi),
    });
    setBusy(false);
    if (ok) {
      onOpenChange(false);
      setTenpai([false, false, false, false]);
      setRiichi([false, false, false, false]);
      setNagashi([false, false, false, false]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="流局结算"
        description={`${roundLabel(game.kyoku, game.honba)}，庄家：${names[game.dealer]}`}
      >
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
              流局的场供收入：
              <span className={preview.riichiIncome > 0 ? "font-semibold text-pos" : "text-muted"}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="accent" onClick={confirm} disabled={busy}>
            确认流局
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ABORTIVE_OPTIONS: Array<{ value: AbortiveReason; label: string }> = [
  { value: "kyuushu", label: "九种九牌" },
  { value: "suufon", label: "四风连打" },
  { value: "suucha", label: "四家立直" },
  { value: "suukan", label: "四杠散了" },
  { value: "sanchahou", label: "三家和了" },
];

export function AbortiveDialog({ open, onOpenChange, game, names, mirror }: DialogProps) {
  const send = useCommand();
  const [reason, setReason] = useState<AbortiveReason>("kyuushu");
  const [riichi, setRiichi] = useState([false, false, false, false]);
  const [busy, setBusy] = useState(false);
  const deltas = SEATS.map((s) => (riichi[s] ? -1000 : 0));
  useMirror(
    open,
    {
      kind: "settlement",
      mode: "abortive",
      deltas,
      summary: ABORTIVE_OPTIONS.find((o) => o.value === reason)?.label ?? null,
    },
    mirror,
  );
  const confirm = async () => {
    setBusy(true);
    const ok = await send({ type: "abortive", reason, riichi: seatsOf(riichi) });
    setBusy(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="途中流局"
        description={`${roundLabel(game.kyoku, game.honba)}，庄家连庄，本场 +1`}
      >
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="accent" onClick={confirm} disabled={busy}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChomboDialog({ open, onOpenChange, game, names, mirror }: DialogProps) {
  const send = useCommand();
  const [offender, setOffender] = useState<Seat>(0);
  const [busy, setBusy] = useState(false);
  useMirror(
    open,
    { kind: "settlement", mode: "chombo", deltas: null, summary: `${names[offender]} 错和` },
    mirror,
  );
  const confirm = async () => {
    setBusy(true);
    const ok = await send({ type: "chombo", offender });
    setBusy(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="错和罚符"
        description={`${roundLabel(game.kyoku, game.honba)}，满贯罚符，场况不变`}
      >
        <div>
          <Label>错和者</Label>
          <Select
            value={String(offender)}
            onValueChange={(v) => setOffender(Number(v) as Seat)}
            options={SEATS.map((s) => ({ value: String(s), label: names[s]! }))}
            className="mt-1"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>
            确认罚符
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdjustDialog({ open, onOpenChange, game, names, rules, mirror }: DialogProps) {
  useMirror(open, { kind: "adjust" }, mirror);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="调整场况"
        description="手动修正当前场次、庄家与本场数，点数不发生变化。"
      >
        <AdjustForm game={game} names={names} rules={rules} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** 每次打开重新挂载，从当前场况初始化。 */
function AdjustForm({
  game,
  names,
  rules,
  onDone,
}: {
  game: GameState;
  names: string[];
  rules: RoomRules;
  onDone: () => void;
}) {
  const send = useCommand();
  const [wind, setWind] = useState(kyokuWind(game.kyoku));
  const [number, setNumber] = useState(kyokuNumber(game.kyoku));
  const [honba, setHonba] = useState(game.honba);
  const [dealer, setDealer] = useState<Seat>(game.dealer);
  const [busy, setBusy] = useState(false);
  const windCount = Math.floor(maxKyoku(rules) / 4) + 1;
  const kyoku = wind * 4 + (number - 1);
  const confirm = async () => {
    setBusy(true);
    const ok = await send({ type: "adjust", kyoku, honba, dealer });
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
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
            onChange={(e) => {
              const n = Math.min(4, Math.max(1, Number(e.target.value) || 1));
              setNumber(n);
              setDealer((n - 1) as Seat);
            }}
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
        <div>
          <Label>庄家</Label>
          <Select
            value={String(dealer)}
            onValueChange={(v) => {
              const d = Number(v) as Seat;
              setDealer(d);
              setNumber(d + 1);
            }}
            options={SEATS.map((s) => ({ value: String(s), label: names[s]! }))}
            className="mt-1"
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        调整后：{roundLabel(kyoku, honba)}，庄家 {names[dealer]}。此操作可撤销。
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
  description,
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
        <p className="text-sm text-muted">{description}</p>
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
