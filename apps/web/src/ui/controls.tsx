import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Check, ChevronDown } from "lucide-react";
import type { ComponentProps, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-xs font-medium text-muted", className)} {...props} />;
}

export function Badge({
  className,
  tone = "neutral",
  size = "sm",
  ...props
}: ComponentProps<"span"> & {
  tone?: "neutral" | "accent" | "pos" | "neg" | "outline";
  /** md：电视端可读尺寸 */
  size?: "sm" | "md";
}) {
  const tones = {
    neutral: "bg-surface-2 text-fg",
    accent: "bg-accent text-accent-fg",
    pos: "bg-pos/15 text-pos",
    neg: "bg-neg/15 text-neg",
    outline: "border border-border text-muted",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium leading-none",
        size === "md" ? "px-2 py-1 text-sm" : "px-1.5 py-0.5 text-[11px]",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="h-3.5 w-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function CheckRow({
  checked,
  onCheckedChange,
  children,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent/10",
        disabled && "opacity-50",
        className,
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
      />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full bg-border transition-colors data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  className,
  placeholder,
  disabled,
}: {
  value: T | undefined;
  onValueChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; disabled?: boolean }>;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Root
      {...(value !== undefined ? { value } : {})}
      onValueChange={(v) => onValueChange(v as T)}
      disabled={disabled ?? false}
    >
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent disabled:opacity-50",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[60] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled ?? false}
                className="relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-7 pr-2 text-sm outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-40"
              >
                <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-3.5 w-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex h-9 items-center gap-1 rounded-lg bg-surface-2 p-1", className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-md px-3 text-sm text-muted transition-colors data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

export const TooltipProvider = TooltipPrimitive.Provider;
export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-[70] rounded-md bg-fg px-2 py-1 text-xs text-bg shadow"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/**
 * 小按钮。单选用 `ChipGroup`，多选/开关式（旗标行）直接用它。
 * 样式只此一处：多选变体不要在业务目录里另抄一份。
 */
export function Chip({
  pressed,
  onClick,
  disabled,
  children,
  className,
}: {
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "h-8 min-w-9 rounded-md border border-border px-2 text-sm tabular disabled:opacity-40",
        pressed ? "border-accent bg-accent text-accent-fg" : "bg-surface hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** 一组可选的小按钮（番数、符数等快选） */
export function ChipGroup<T extends string | number>({
  value,
  onChange,
  options,
  className,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => (
        <Chip key={String(o.value)} pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}
