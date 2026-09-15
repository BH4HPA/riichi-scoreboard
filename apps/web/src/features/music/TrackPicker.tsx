import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Play, Square } from "lucide-react";
import { musicUrl, type MusicTrack } from "@riichi/core";
import { Dialog, DialogContent } from "@/ui/dialog";
import { cn } from "@/lib/utils";

const TRIGGER_HEIGHT = { sm: "h-8 text-xs", md: "h-10 text-sm", lg: "h-12 text-base" } as const;

/**
 * 曲目选择器：触发器长得像下拉框；点开是弹层列表，每行可试听（▶ / ■），点曲名选用并关闭。
 * 试听在点击处理器里同步 play()，满足 iOS 的用户手势要求；弹层关闭、换曲或卸载即停。
 */
export function TrackPicker({
  tracks,
  value,
  onChange,
  size,
}: {
  tracks: readonly MusicTrack[];
  value: string | null;
  onChange: (id: string) => void;
  size: keyof typeof TRIGGER_HEIGHT;
}) {
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const stopPreview = () => {
    audio.current?.pause();
    audio.current = null;
    setPreviewing(null);
  };
  const preview = (id: string) => {
    if (previewing === id) return stopPreview();
    audio.current?.pause();
    const el = new Audio(musicUrl(id));
    el.onended = () => audio.current === el && stopPreview();
    el.onerror = () => audio.current === el && stopPreview();
    audio.current = el;
    setPreviewing(id);
    el.play().catch(() => audio.current === el && stopPreview());
  };
  const onOpenChange = (next: boolean) => {
    if (!next) stopPreview();
    setOpen(next);
  };
  useEffect(() => () => audio.current?.pause(), []);

  const selected = tracks.find((t) => t.id === value) ?? null;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="选择立直音乐"
        onClick={() => setOpen(true)}
        className={cn(
          "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 outline-none focus-visible:border-accent",
          TRIGGER_HEIGHT[size],
        )}
      >
        <span className="min-w-0 truncate">{selected?.title ?? "选择立直音乐"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent title="立直音乐" description="点 ▶ 试听，点曲名选用">
          <ul className="-mx-1 space-y-0.5">
            {tracks.map((t) => {
              const isSelected = t.id === value;
              const isPreviewing = previewing === t.id;
              return (
                <li key={t.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={isPreviewing ? `停止试听 ${t.title}` : `试听 ${t.title}`}
                    aria-pressed={isPreviewing}
                    onClick={() => preview(t.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg aria-pressed:text-accent"
                  >
                    {isPreviewing ? (
                      <Square className="h-4 w-4" fill="currentColor" />
                    ) : (
                      <Play className="h-4 w-4" fill="currentColor" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      onChange(t.id);
                      onOpenChange(false);
                    }}
                    className="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 text-left text-sm hover:bg-surface-2 aria-pressed:font-semibold"
                  >
                    <span className="truncate">{t.title}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-accent" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
