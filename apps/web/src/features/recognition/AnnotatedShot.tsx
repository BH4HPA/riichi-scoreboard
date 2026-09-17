import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import type { Detection } from "@riichi/core";
import { Button } from "@/ui/button";
import { renderAnnotated } from "./annotate";

/**
 * 标注模式里回看这一张：定格帧 + 烧进去的检测框。点开是灯箱，可以下载存档。
 * 在这儿看框（而不是只在取景时一闪而过）才真能核对模型把什么认成了什么。
 */
export function AnnotatedShot({ photo, detections }: { photo: Blob; detections: Detection[] }) {
  // 渲染结果连同它属于哪张照片一起存：换了照片就自动算「还在画」，不用在 effect 里同步重置
  const [done, setDone] = useState<{ photo: Blob; url: string | null } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    renderAnnotated(photo, detections)
      .then((blob) => {
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setDone({ photo, url: revoked });
      })
      .catch(() => !cancelled && setDone({ photo, url: null }));
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [photo, detections]);

  const ready = done?.photo === photo ? done : null;
  if (!ready) return <div className="h-24 animate-pulse rounded-lg bg-surface-2" />;
  const url = ready.url;
  if (!url) return <p className="text-xs text-muted">这张画不出标注图（不影响提交）</p>;

  const name = `riichi-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.jpg`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full overflow-hidden rounded-lg border border-border"
        aria-label="放大查看带标注的照片"
        data-testid="annotated-shot"
      >
        <img src={url} alt="带检测框的照片" className="block max-h-40 w-full object-contain" />
      </button>

      {open &&
        createPortal(
          <div
            className="pointer-events-auto fixed inset-0 z-[78] flex flex-col bg-black/95"
            role="dialog"
            aria-modal="true"
            aria-label="带标注的照片"
            data-testid="annotated-lightbox"
          >
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
              <img src={url} alt="带检测框的照片" className="max-h-full max-w-full" />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                <X className="mr-1 h-4 w-4" />
                关闭
              </Button>
              <Button asChild variant="accent" size="sm">
                <a href={url} download={name} data-testid="annotated-download">
                  <Download className="mr-1 h-4 w-4" />
                  下载
                </a>
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
