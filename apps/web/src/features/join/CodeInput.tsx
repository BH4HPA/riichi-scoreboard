import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
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
 *
 * input 里放的是用户原样打出来的文字，格子显示规范化后的码。输入事件里从不同步改写 input 的值：
 * 输入法组词（iOS 拼音键盘打字母就在组词）时改写会打断 WebKit 的组词缓冲，输入法把缓冲再插一遍，
 * 一键出两三个字母。清理成规范码只在不组词时、且延后到这次编辑命令走完之后做（另加失焦时）。
 */
export function CodeInput({
  onChange,
  onComplete,
  shakeKey = 0,
  invalid = false,
  disabled = false,
}: {
  onChange: (code: string) => void;
  /** 输满 6 位时触发（每次达到 6 位都触发一次） */
  onComplete: (code: string) => void;
  /** 每次递增触发一次抖动（不重挂载，保持焦点与键盘） */
  shakeKey?: number;
  invalid?: boolean;
  /** 校验中：只读但保持焦点 */
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [focused, setFocused] = useState(false);
  // 抖动：shakeKey 变化时加类，动画结束移除；不重挂载 input，键盘不会收起
  const [shakingFor, setShakingFor] = useState(0);
  const shaking = shakeKey > 0 && shakingFor !== shakeKey;
  const code = normalize(raw);

  const accept = (nextRaw: string) => {
    setRaw(nextRaw);
    const next = normalize(nextRaw);
    if (next === code) return; // 已满 6 位再敲键：码不变，不重复校验
    onChange(next);
    if (next.length === LENGTH) onComplete(next);
  };
  // 组词状态：延后的清理触发时若又进入了组词（快速连打、换输入法），这时改写同样会打断组词，必须跳过。
  // 失焦时复位，compositionend 万一丢失也不会一直卡住。
  const composing = useRef(false);
  const tidy = () => setRaw((r) => normalize(r));
  // 等这次编辑命令走完再清理
  const tidyLater = () =>
    setTimeout(() => {
      if (!composing.current) tidy();
    }, 0);
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    accept(e.target.value);
    if (!(e.nativeEvent as InputEvent).isComposing) tidyLater();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const fromLink = roomCodeFrom(e.clipboardData.getData("text"));
    if (fromLink) {
      e.preventDefault();
      accept(fromLink);
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
      onAnimationEnd={() => setShakingFor(shakeKey)}
    >
      <div className="grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: LENGTH }, (_, i) => {
          const ch = code[i] ?? "";
          const active =
            focused && (i === code.length || (i === LENGTH - 1 && code.length === LENGTH));
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
        value={raw}
        onChange={onInput}
        // WebKit 在 compositionend 之后还有一个不在组词中的尾随 input，Chromium 没有，这里兜底
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => {
          composing.current = false;
          tidyLater();
        }}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          composing.current = false;
          tidy();
        }}
        onSelect={caretToEnd}
        readOnly={disabled}
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
