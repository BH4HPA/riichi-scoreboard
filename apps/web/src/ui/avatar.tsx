import { assetUrl } from "@/api/client";
import { cn } from "@/lib/utils";

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
    xl: "h-20 w-20 text-xl",
  };
  const url = assetUrl(src);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-medium text-muted",
        sizes[size],
        className,
      )}
    >
      {url ? <img src={url} alt={name} className="h-full w-full object-cover" /> : name.slice(0, 1)}
    </span>
  );
}
