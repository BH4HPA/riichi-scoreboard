import { SEATS, type Seat } from "@riichi/core";
import { CheckRow, Label, Select } from "@/ui/controls";
import { seatOptions } from "./format";

export function SeatFlags({
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

export function SeatSelect({
  label,
  names,
  value,
  onChange,
  exclude = [],
}: {
  label: string;
  names: string[];
  value: Seat;
  onChange: (s: Seat) => void;
  exclude?: Seat[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select
        value={String(value)}
        onValueChange={(v) => onChange(Number(v) as Seat)}
        options={seatOptions(names, exclude)}
        className="mt-1"
      />
    </div>
  );
}
