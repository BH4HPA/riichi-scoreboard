import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Play, Square } from "lucide-react";
import type { MusicTrack } from "@riichi/core";
import { Dialog, DialogContent } from "@/ui/dialog";
import { cn } from "@/lib/utils";
import { loadMusic } from "./loader";
import { LoadRing } from "./LoadRing";

const TRIGGER_HEIGHT = { sm: "h-8 text-xs", md: "h-10 text-sm", lg: "h-12 text-base" } as const;

/**
 * 曲目选择器：触发器长得像下拉框；点开是弹层列表，每行可试听（▶ / ■），点曲名选用并关闭。
 * 试听与电视端同一下载器（整文件 → blob，避开 CDN 对 Range 请求的偶发失败）；
 * 为满足 iOS 的手势要求，点按时先对空元素同步调一次 play() 解锁，下载完再赋 src 播放。
 * 弹层关闭、换曲或卸载即停。
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
  /** 试听曲的下载进度（0–1）；null = 未在下载（未试听或已开始播放） */
  const [loading, setLoading] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const release = (el: HTMLAudioElement | null) => {
    if (!el) return;
    el.pause();
    el.removeAttribute("src");
    el.load();
  };
  const stopPreview = () => {
    release(audio.current);
    audio.current = null;
    setPreviewing(null);
    setLoading(null);
  };
  const preview = (id: string) => {
    if (previewing === id) return stopPreview();
    release(audio.current);
    const el = new Audio();
    // 没有 src 时 play() 会被拒（NotSupportedError），忽略；目的只是让这个元素在手势内被激活
    el.play().catch(() => {});
    audio.current = el;
    setPreviewing(id);
    const stillMine = () => audio.current === el;
    loadMusic(id, (p) => stillMine() && setLoading(p)).then(
      (url) => {
        if (!stillMine()) return;
        el.onended = () => stillMine() && stopPreview();
        el.onerror = () => stillMine() && stopPreview();
        el.src = url;
        setLoading(null);
        el.play().catch(() => stillMine() && stopPreview());
      },
      () => stillMine() && stopPreview(),
    );
  };
  const onOpenChange = (next: boolean) => {
    if (!next) stopPreview();
    setOpen(next);
  };
  useEffect(() => () => release(audio.current), []);

  const selected = tracks.find((t) => t.id === value) ?? null;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`立直音乐：${selected?.title ?? "未选择"}`}
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
                    aria-busy={isPreviewing && loading !== null}
                    onClick={() => preview(t.id)}
                    className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg aria-pressed:text-accent"
                  >
                    {isPreviewing && loading !== null && (
                      <LoadRing progress={loading} className="p-1.5" />
                    )}
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
