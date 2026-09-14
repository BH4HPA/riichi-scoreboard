import { useState } from "react";
import {
  formatDiff,
  formatPoints,
  roundLabel,
  SEATS,
  type GameState,
  type RoomRules,
  type Seat,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { CheckRow, Label, Select } from "@/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useCommand } from "@/ws/useRoom";
import {
  createValueDraft,
  draftToClientValue,
  draftValue,
  ValuePicker,
  type ValueDraft,
} from "./ValuePicker";
import { PreviewGrid, incomeBreakdown } from "./PreviewGrid";
import { previewRon, previewTsumo } from "./preview";
import { useMirror } from "./useMirror";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: GameState;
  names: string[];
  rules: RoomRules;
  mirror: boolean;
  defaultSeat: Seat | null;
}

function seatOptions(names: string[], exclude: Seat[] = []) {
  return SEATS.map((s) => ({ value: String(s), label: names[s]!, disabled: exclude.includes(s) }));
}

function RiichiPicker({
  names,
  value,
  onChange,
}: {
  names: string[];
  value: boolean[];
  onChange: (v: boolean[]) => void;
}) {
  return (
    <div>
      <Label>立直情况</Label>
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

function PaoPicker({
  names,
  winner,
  value,
  onChange,
}: {
  names: string[];
  winner: Seat;
  value: Seat | null;
  onChange: (v: Seat | null) => void;
}) {
  return (
    <div>
      <Label>包牌（责任払い）</Label>
      <Select
        value={value === null ? "none" : String(value)}
        onValueChange={(v) => onChange(v === "none" ? null : (Number(v) as Seat))}
        options={[{ value: "none", label: "无" }, ...seatOptions(names, [winner])]}
        className="mt-1"
      />
    </div>
  );
}

const seatsOf = (flags: boolean[]) => SEATS.filter((s) => flags[s]);

export function TsumoDialog({
  open,
  onOpenChange,
  game,
  names,
  rules,
  mirror,
  defaultSeat,
}: DialogProps) {
  const send = useCommand();
  const [winner, setWinner] = useState<Seat>(defaultSeat ?? 0);
  const [draft, setDraft] = useState<ValueDraft>(() => createValueDraft(true));
  const [riichi, setRiichi] = useState([false, false, false, false]);
  const [pao, setPao] = useState<Seat | null>(null);
  const [busy, setBusy] = useState(false);

  const value = draftValue(draft);
  const preview = value ? previewTsumo(game, rules, winner, value, seatsOf(riichi), pao) : null;
  const summary = preview
    ? `${names[winner]} 自摸 ${preview.valueText}，收入 ${formatDiff(preview.payment.deltas[winner]!)} 点`
    : null;
  useMirror(
    open,
    { kind: "settlement", mode: "tsumo", deltas: preview?.payment.deltas ?? null, summary },
    mirror,
  );

  const confirm = async () => {
    setBusy(true);
    const ok = await send({
      type: "tsumo",
      winner,
      value: draftToClientValue(draft),
      riichi: seatsOf(riichi),
      ...(pao !== null ? { pao } : {}),
    });
    setBusy(false);
    if (ok) {
      onOpenChange(false);
      setDraft(createValueDraft(true));
      setRiichi([false, false, false, false]);
      setPao(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="自摸结算"
        description={`${roundLabel(game.kyoku, game.honba)}，庄家：${names[game.dealer]}`}
      >
        <div className="space-y-3">
          <div>
            <Label>自摸者</Label>
            <Select
              value={String(winner)}
              onValueChange={(v) => setWinner(Number(v) as Seat)}
              options={seatOptions(names)}
              className="mt-1"
            />
          </div>
          <ValuePicker draft={draft} onChange={setDraft} rules={rules} seat={winner} />
          <RiichiPicker names={names} value={riichi} onChange={setRiichi} />
          {rules.scoring.pao && (
            <PaoPicker names={names} winner={winner} value={pao} onChange={setPao} />
          )}
          <div>
            <Label>结算预览</Label>
            {preview ? (
              <>
                <PreviewGrid deltas={preview.payment.deltas} names={names} className="mt-1" />
                <p className="mt-2 text-sm">
                  {names[winner]} 自摸的最终收入：
                  <span className="font-semibold text-pos">
                    {formatDiff(preview.payment.deltas[winner]!)}
                  </span>{" "}
                  点
                </p>
                <p className="text-xs text-muted">
                  {incomeBreakdown({
                    base: preview.baseIncome,
                    honba: preview.payment.honbaIncome,
                    kyotaku: preview.payment.kyotakuIncome,
                    riichi: preview.payment.riichiIncome,
                  })}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">请先完整选择和填写</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="accent" onClick={confirm} disabled={!preview || busy}>
            确认自摸
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RonDialog({
  open,
  onOpenChange,
  game,
  names,
  rules,
  mirror,
  defaultSeat,
}: DialogProps) {
  const send = useCommand();
  const maxWins = { atamahane: 1, double: 2, triple: 3 }[rules.win.multiRon];
  const [loser, setLoser] = useState<Seat>(defaultSeat === null || defaultSeat === 0 ? 1 : 0);
  const [wins, setWins] = useState<Array<{ winner: Seat; draft: ValueDraft; pao: Seat | null }>>(
    () => [{ winner: defaultSeat ?? 0, draft: createValueDraft(false), pao: null }],
  );
  const [riichi, setRiichi] = useState([false, false, false, false]);
  const [busy, setBusy] = useState(false);

  const drafts = wins.map((w) => ({ winner: w.winner, value: draftValue(w.draft), pao: w.pao }));
  const allValued = drafts.every((d) => d.value !== null);
  const distinct =
    new Set(wins.map((w) => w.winner)).size === wins.length &&
    !wins.some((w) => w.winner === loser);
  const preview =
    allValued && distinct
      ? previewRon(
          game,
          rules,
          loser,
          drafts.map((d) => ({ winner: d.winner, value: d.value!, pao: d.pao })),
          seatsOf(riichi),
        )
      : null;
  const summary = preview
    ? preview.wins
        .map(
          (p, i) =>
            `${names[wins[i]!.winner]} 荣和 ${names[loser]} ${p.valueText}，收入 ${formatDiff(preview.deltas[wins[i]!.winner]!)} 点`,
        )
        .join("；")
    : null;
  useMirror(
    open,
    { kind: "settlement", mode: "ron", deltas: preview?.deltas ?? null, summary },
    mirror,
  );

  const confirm = async () => {
    setBusy(true);
    const ok = await send({
      type: "ron",
      loser,
      wins: wins.map((w) => ({
        winner: w.winner,
        value: draftToClientValue(w.draft),
        ...(w.pao !== null ? { pao: w.pao } : {}),
      })),
      riichi: seatsOf(riichi),
    });
    setBusy(false);
    if (ok) {
      onOpenChange(false);
      setWins([{ winner: defaultSeat ?? 0, draft: createValueDraft(false), pao: null }]);
      setRiichi([false, false, false, false]);
    }
  };

  const setWin = (i: number, patch: Partial<(typeof wins)[number]>) =>
    setWins(wins.map((w, k) => (k === i ? { ...w, ...patch } : w)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="荣和结算"
        description={`${roundLabel(game.kyoku, game.honba)}，庄家：${names[game.dealer]}`}
      >
        <div className="space-y-3">
          <div>
            <Label>放铳者</Label>
            <Select
              value={String(loser)}
              onValueChange={(v) => setLoser(Number(v) as Seat)}
              options={seatOptions(names)}
              className="mt-1"
            />
          </div>
          {wins.map((w, i) => (
            <div key={i} className="rounded-lg border border-border p-2.5">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label>荣和者{wins.length > 1 ? ` ${i + 1}` : ""}</Label>
                  <Select
                    value={String(w.winner)}
                    onValueChange={(v) => setWin(i, { winner: Number(v) as Seat })}
                    options={seatOptions(names, [loser])}
                    className="mt-1"
                  />
                </div>
                {wins.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWins(wins.filter((_, k) => k !== i))}
                  >
                    移除
                  </Button>
                )}
              </div>
              <div className="mt-2">
                <ValuePicker
                  draft={w.draft}
                  onChange={(draft) => setWin(i, { draft })}
                  rules={rules}
                  seat={w.winner}
                />
              </div>
              {rules.scoring.pao && (
                <div className="mt-2">
                  <PaoPicker
                    names={names}
                    winner={w.winner}
                    value={w.pao}
                    onChange={(pao) => setWin(i, { pao })}
                  />
                </div>
              )}
            </div>
          ))}
          {wins.length < maxWins && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setWins([
                  ...wins,
                  {
                    winner:
                      SEATS.find((s) => s !== loser && !wins.some((w) => w.winner === s)) ?? 0,
                    draft: createValueDraft(false),
                    pao: null,
                  },
                ])
              }
            >
              添加荣和者（{rules.win.multiRon === "double" ? "双响" : "三响"}）
            </Button>
          )}
          {!distinct && (
            <p className="text-xs text-neg">荣和者与放铳者不能是同一人，荣和者之间不能重复</p>
          )}
          <RiichiPicker names={names} value={riichi} onChange={setRiichi} />
          <div>
            <Label>结算预览</Label>
            {preview ? (
              <>
                <PreviewGrid deltas={preview.deltas} names={names} className="mt-1" />
                {preview.wins.map((p, i) => (
                  <div key={i} className="mt-2">
                    <p className="text-sm">
                      {names[wins[i]!.winner]} 荣和的最终收入：
                      <span className="font-semibold text-pos">
                        {formatDiff(preview.deltas[wins[i]!.winner]!)}
                      </span>{" "}
                      点
                    </p>
                    <p className="text-xs text-muted">
                      {incomeBreakdown({
                        base: p.baseIncome,
                        honba: p.payment.honbaIncome,
                        kyotaku: p.payment.kyotakuIncome,
                        riichi: p.payment.riichiIncome,
                      })}
                    </p>
                  </div>
                ))}
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">请先完整选择和填写</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="accent" onClick={confirm} disabled={!preview || busy}>
            确认荣和
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function drawKyotakuText(before: number, after: number): string {
  return `历史立直供托 ${formatPoints(before * 1000)} 点，收入后共 ${formatPoints(after * 1000)} 点`;
}
