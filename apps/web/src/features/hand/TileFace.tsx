import { isHonor, tileNumber, tileSuit, type Tile } from "@riichi/core";
import { cn } from "@/lib/utils";
import { tileLabel } from "./tileLabel";

const HONORS = ["東", "南", "西", "北", "白", "發", "中"];
const SUIT_LABEL = { m: "萬", p: "筒", s: "索", z: "" } as const;
const SUIT_COLOR = {
  m: "text-rose-600",
  p: "text-sky-600",
  s: "text-emerald-600",
  z: "text-fg",
} as const;

export function TileFace({
  tile,
  size = "md",
  selected = false,
  dim = false,
  onClick,
  className,
}: {
  tile: Tile;
  size?: "sm" | "md";
  selected?: boolean;
  dim?: boolean;
  onClick?: (() => void) | undefined;
  className?: string;
}) {
  const suit = tileSuit(tile);
  const honor = isHonor(tile);
  const body = (
    <span
      className={cn(
        "inline-flex flex-col items-center justify-center rounded-md border bg-white leading-none text-black shadow-sm",
        size === "sm" ? "h-9 w-7 text-[11px]" : "h-12 w-9 text-sm",
        selected ? "border-accent ring-2 ring-accent/50" : "border-zinc-300",
        dim && "opacity-40",
        className,
      )}
    >
      {honor ? (
        <span
          className={cn(
            "font-semibold",
            size === "sm" ? "text-sm" : "text-lg",
            tile === 33 ? "text-emerald-700" : tile === 34 ? "text-rose-600" : "text-zinc-800",
          )}
        >
          {HONORS[tile - 28]}
        </span>
      ) : (
        <>
          <span
            className={cn(
              "font-semibold tabular",
              size === "sm" ? "text-sm" : "text-lg",
              SUIT_COLOR[suit],
            )}
          >
            {tileNumber(tile)}
          </span>
          <span className={cn("text-[9px]", SUIT_COLOR[suit])}>{SUIT_LABEL[suit]}</span>
        </>
      )}
    </span>
  );
  if (!onClick) return body;
  return (
    <button
      type="button"
      onClick={onClick}
      className="active:scale-95"
      aria-label={tileLabel(tile)}
      aria-pressed={selected}
    >
      {body}
    </button>
  );
}
