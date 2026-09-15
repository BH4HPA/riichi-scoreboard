import { Check, LogOut, UserPlus } from "lucide-react";
import { isLocalPlayer, SEATS, WIND_LABELS, type PlayerRef, type Seat } from "@riichi/core";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/controls";
import { cn } from "@/lib/utils";

/**
 * 四个座位卡。手机端：点空座入座（onPick）。
 * 电视端：空座可「添加本地玩家」（onAddLocal）。本地玩家（快照 kind=local）任何端都可「离座」（onLeave）。
 */
export function SeatCards({
  seats,
  ready,
  mySeat,
  onPick,
  onAddLocal,
  onLeave,
  tv = false,
}: {
  seats: (PlayerRef | null)[];
  ready: boolean[];
  mySeat: Seat | null;
  onPick?: ((seat: Seat) => void) | undefined;
  onAddLocal?: ((seat: Seat) => void) | undefined;
  onLeave?: ((seat: Seat) => void) | undefined;
  tv?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", tv ? "grid-cols-2 gap-4" : "grid-cols-1")}>
      {SEATS.map((seat) => {
        const p = seats[seat];
        const mine = mySeat === seat;
        const clickable = Boolean(onPick) && !mine && !p;
        const isLocal = isLocalPlayer(p);
        return (
          <div
            key={seat}
            data-testid={`seat-${seat}`}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
              mine ? "border-accent bg-accent/10" : "border-border bg-surface",
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
                  {isLocal && (
                    <Badge tone="outline" className="ml-2 align-middle">
                      本地
                    </Badge>
                  )}
                </span>
                {ready[seat] ? (
                  <Badge tone="pos">
                    <Check className="h-3 w-3" /> 已准备
                  </Badge>
                ) : (
                  <Badge tone="outline">未准备</Badge>
                )}
                {isLocal && onLeave && (
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
                    onClick={() => onLeave(seat)}
                    aria-label={`${p.name} 离座`}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                )}
              </>
            ) : clickable ? (
              <button
                type="button"
                className={cn("flex-1 text-left text-muted", tv ? "text-lg" : "text-sm")}
                onClick={() => onPick?.(seat)}
              >
                点击入座
              </button>
            ) : (
              <>
                <span className={cn("flex-1 text-muted", tv ? "text-lg" : "text-sm")}>
                  等待加入
                </span>
                {onAddLocal && (
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 text-muted hover:border-accent hover:text-accent",
                      tv ? "text-sm" : "text-xs",
                    )}
                    onClick={() => onAddLocal(seat)}
                  >
                    <UserPlus className="h-4 w-4" /> 添加本地玩家
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
