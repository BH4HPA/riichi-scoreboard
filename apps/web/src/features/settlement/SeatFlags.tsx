import { relativeSeatLabel, SEATS, type Seat } from "@riichi/core";
import { CheckRow, Label, Select } from "@/ui/controls";

/** 选人控件里的玩家名：在座时名字后跟灰色的相对方位。 */
function SeatName({ names, mySeat, seat }: { names: string[]; mySeat: Seat | null; seat: Seat }) {
  const relative = relativeSeatLabel(mySeat, seat);
  return (
    <>
      {names[seat]}
      {relative && <span className="ml-1.5 text-xs text-muted">{relative}</span>}
    </>
  );
}

function seatOptions(names: string[], mySeat: Seat | null, exclude: Seat[] = []) {
  return SEATS.map((s) => ({
    value: String(s),
    label: <SeatName names={names} mySeat={mySeat} seat={s} />,
    disabled: exclude.includes(s),
  }));
}

export function SeatFlags({
  label,
  names,
  mySeat,
  value,
  onChange,
}: {
  label: string;
  names: string[];
  mySeat: Seat | null;
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
            <SeatName names={names} mySeat={mySeat} seat={s} />
          </CheckRow>
        ))}
      </div>
    </div>
  );
}

export function SeatSelect({
  label,
  names,
  mySeat,
  value,
  onChange,
  exclude = [],
}: {
  label: string;
  names: string[];
  mySeat: Seat | null;
  /** null = 还没选 */
  value: Seat | null;
  onChange: (s: Seat) => void;
  exclude?: Seat[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select
        value={value === null ? null : String(value)}
        placeholder="请选择"
        onValueChange={(v) => onChange(Number(v) as Seat)}
        options={seatOptions(names, mySeat, exclude)}
        className="mt-1"
      />
    </div>
  );
}

/** 包牌者：仅规则开启且当前价值为役满时可选。 */
export function PaoPicker({
  names,
  mySeat,
  winner,
  value,
  onChange,
}: {
  names: string[];
  mySeat: Seat | null;
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
        options={[{ value: "none", label: "无" }, ...seatOptions(names, mySeat, [winner])]}
        className="mt-1"
      />
    </div>
  );
}
