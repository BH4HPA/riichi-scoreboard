import { useRef, useState, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";
import { roomCodeFrom } from "./roomCode";

const LENGTH = 6;
/** 房间码字母表（与服务端一致：不含 0/1/I/O） */
const ALPHABET = /[^A-HJ-NP-Z2-9]/g;

function normalize(raw: string): string {
  return raw.toUpperCase().replace(ALPHABET, "").slice(0, LENGTH);
}

/**
 * 六格房间码：一个隐形 input 覆盖在六个格子上（手机键盘、粘贴行为都由原生 input 负责），
 * 格子只做展示。粘贴整条加入链接也能识别出房间码。
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  shaking = false,
  invalid = false,
  disabled = false,
}: {
  value: string;
  onChange: (code: string) => void;
  /** 输满 6 位时触发（每次达到 6 位都触发一次） */
  onComplete: (code: string) => void;
  shaking?: boolean;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const commit = (next: string) => {
    onChange(next);
    if (next.length === LENGTH) onComplete(next);
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    const fromLink = roomCodeFrom(text);
    if (fromLink) {
      e.preventDefault();
      commit(fromLink);
    }
  };
  const caretToEnd = () => {
    const el = inputRef.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  };

  return (
    <div
      className={cn("relative", shaking && "animate-shake")}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: LENGTH }, (_, i) => {
          const ch = value[i] ?? "";
          const active =
            focused && (i === value.length || (i === LENGTH - 1 && value.length === LENGTH));
          return (
            <div
              key={i}
              className={cn(
                "flex h-14 items-center justify-center rounded-lg border bg-surface text-2xl font-semibold tabular",
                invalid ? "border-neg" : active ? "border-accent" : "border-border",
              )}
            >
              {ch}
            </div>
          );
        })}
      </div>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => commit(normalize(e.target.value))}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSelect={caretToEnd}
        disabled={disabled}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        aria-label="房间码"
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  );
}
