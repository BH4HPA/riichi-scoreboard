import { cn } from "@/lib/utils";

/** 二级页签：一行等宽按钮，电视端加大。只读镜像时 onChange 为空。 */
export function SubTabs({
  value,
  onChange,
  options,
  tv,
}: {
  value: string;
  onChange?: ((v: string) => void) | undefined;
  options: Array<{ value: string; label: string }>;
  tv: boolean;
}) {
  return (
    <div
      className={cn("flex gap-1", tv ? "flex-wrap" : "-mx-1 overflow-x-auto px-1 pb-0.5")}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          aria-disabled={!onChange}
          tabIndex={onChange ? 0 : -1}
          onClick={() => onChange?.(o.value)}
          className={cn(
            "whitespace-nowrap rounded-md border px-2.5 py-1 text-center font-medium transition-colors aria-disabled:cursor-default",
            tv ? "flex-1 text-base" : "flex-none text-sm",
            o.value === value
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-surface text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
