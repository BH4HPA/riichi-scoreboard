import { Check, LogOut, UserPlus } from "lucide-react";
import { isLocalPlayer, SEATS, WIND_LABELS, type PlayerRef, type Seat } from "@riichi/core";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/controls";
import { cn } from "@/lib/utils";

/** 空座的头像占位：与 Avatar 同尺寸的虚线圆，让空座与有人座同高。 */
function AvatarSlot({ tv }: { tv: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border border-dashed border-border",
        tv ? "h-12 w-12" : "h-9 w-9",
      )}
      aria-hidden
    />
  );
}

/**
 * 四个座位卡。手机端：点空座入座（onPick），点自己的座位离座（onLeave）——整卡即按钮。
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
    <div className={cn("grid gap-2", onAddLocal ? "grid-cols-2" : "grid-cols-1", tv && "gap-4")}>
      {SEATS.map((seat) => {
        const p = seats[seat];
        const mine = mySeat === seat;
        const isLocal = isLocalPlayer(p);
        const cardClass = cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3 text-left transition-colors",
          mine ? "border-accent bg-accent/10" : "border-border bg-surface",
          tv && "p-5",
        );
        const wind = (
          <span className={cn("w-6 text-center font-semibold text-muted", tv && "text-2xl")}>
            {WIND_LABELS[seat]}
          </span>
        );

        // 空座 + 可入座：整卡是「点击入座」按钮
        if (!p && onPick) {
          return (
            <button
              key={seat}
              type="button"
              data-testid={`seat-${seat}`}
              className={cn(cardClass, "hover:border-accent/60")}
              onClick={() => onPick(seat)}
              aria-label={`${WIND_LABELS[seat]}家 点击入座`}
            >
              {wind}
              <AvatarSlot tv={tv} />
              <span className={cn("flex-1 text-muted", tv ? "text-lg" : "text-sm")}>点击入座</span>
            </button>
          );
        }

        // 自己的座位：整卡是「离座」按钮
        if (p && mine && onLeave) {
          return (
            <button
              key={seat}
              type="button"
              data-testid={`seat-${seat}`}
              className={cardClass}
              onClick={() => onLeave(seat)}
              aria-label={`${WIND_LABELS[seat]}家 ${p.name}${ready[seat] ? "（已准备）" : ""} 离座`}
            >
              {wind}
              <Avatar name={p.name} src={p.avatar} size={tv ? "lg" : "md"} />
              <span className={cn("min-w-0 flex-1 truncate", tv ? "text-xl" : "text-sm")}>
                {p.name}
              </span>
              <ReadyBadge ready={ready[seat] === true} />
              {/* 与本地玩家卡的离座按钮同尺寸，右侧对齐 */}
              <span className="p-1.5 text-muted" aria-hidden>
                <LogOut className="h-4 w-4" />
              </span>
            </button>
          );
        }

        return (
          <div key={seat} data-testid={`seat-${seat}`} className={cardClass}>
            {wind}
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
                <ReadyBadge ready={ready[seat] === true} />
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
            ) : (
              <>
                <AvatarSlot tv={tv} />
                <span
                  className={cn("flex-1 whitespace-nowrap text-muted", tv ? "text-lg" : "text-sm")}
                >
                  等待加入
                </span>
                {onAddLocal && (
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-border px-2.5 py-1 text-muted hover:border-accent hover:text-accent",
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

function ReadyBadge({ ready }: { ready: boolean }) {
  return ready ? (
    <Badge tone="pos">
      <Check className="h-3 w-3" /> 已准备
    </Badge>
  ) : (
    <Badge tone="outline">未准备</Badge>
  );
}
