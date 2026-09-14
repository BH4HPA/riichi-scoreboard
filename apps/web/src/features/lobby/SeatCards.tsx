import { Check } from "lucide-react";
import { SEATS, WIND_LABELS, type PlayerRef, type Seat } from "@riichi/core";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/controls";
import { cn } from "@/lib/utils";

export function SeatCards({
  seats,
  ready,
  mySeat,
  onPick,
  tv = false,
}: {
  seats: (PlayerRef | null)[];
  ready: boolean[];
  mySeat: Seat | null;
  onPick?: ((seat: Seat) => void) | undefined;
  tv?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", tv ? "grid-cols-2 gap-4" : "grid-cols-1")}>
      {SEATS.map((seat) => {
        const p = seats[seat];
        const mine = mySeat === seat;
        const clickable = onPick && !mine && (!p || false);
        return (
          <button
            key={seat}
            type="button"
            disabled={!clickable}
            data-testid={`seat-${seat}`}
            onClick={() => onPick?.(seat)}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
              mine ? "border-accent bg-accent/10" : "border-border bg-surface",
              clickable && "hover:bg-surface-2",
              !clickable && "cursor-default",
              tv && "p-5",
            )}
          >
            <span className={cn("w-6 text-center font-semibold text-muted", tv && "text-2xl")}>
              {WIND_LABELS[seat]}
            </span>
            {p ? (
              <>
                <Avatar name={p.name} src={p.avatar} size={tv ? "lg" : "md"} />
                <span className={cn("min-w-0 flex-1 truncate", tv ? "text-xl" : "text-sm")}>
                  {p.name}
                </span>
                {ready[seat] ? (
                  <Badge tone="pos">
                    <Check className="h-3 w-3" /> 已准备
                  </Badge>
                ) : (
                  <Badge tone="outline">未准备</Badge>
                )}
              </>
            ) : (
              <span className={cn("text-muted", tv ? "text-lg" : "text-sm")}>
                {onPick ? "点击入座" : "等待加入"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
