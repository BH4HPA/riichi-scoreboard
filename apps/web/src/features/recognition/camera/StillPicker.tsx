import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/ui/button";
import { loadPhoto } from "../photoFile";
import { BAND_DEFAULT, bandRect, type Rect } from "./band";
import { BandOverlay } from "./BandOverlay";

/**
 * 相册里挑一张来识别（只在标注模式给）。用的还是同一条取景带：
 * 「带」这个概念在实时与静帧两处保持一致，仓库里不留第二套裁剪实现。
 * 解码走 `loadPhoto` 而不是裸 `createImageBitmap`——iOS 竖拍的方向全靠它的 EXIF 处理。
 */
export function StillPicker({
  file,
  onPick,
  onCancel,
}: {
  file: File;
  onPick: (bitmap: ImageBitmap, rect: Rect) => void;
  onCancel: () => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [band, setBand] = useState(BAND_DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    let loaded: ImageBitmap | null = null;
    let cancelled = false;
    loadPhoto(file)
      .then((b) => {
        loaded = b;
        if (!cancelled) setBitmap(b);
      })
      .catch(() => !cancelled && setError("无法读取这张照片"));
    return () => {
      cancelled = true;
      loaded?.close();
    };
  }, [file]);

  const confirm = () => {
    const box = boxRef.current;
    if (!bitmap || !box) return;
    const rect = bandRect(
      {
        videoWidth: bitmap.width,
        videoHeight: bitmap.height,
        displayWidth: box.clientWidth,
        displayHeight: box.clientHeight,
      },
      band,
    );
    if (rect) onPick(bitmap, rect);
  };

  return (
    <div className="fixed inset-0 z-[76] flex flex-col bg-black" data-testid="still-picker">
      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden">
        <img src={url} alt="" className="h-full w-full object-cover" />
        <BandOverlay band={band} onBandChange={setBand} hint="把手牌放进框里，牌河留在暗区" />
      </div>
      <div className="flex items-center justify-between gap-3 bg-black/90 px-4 py-3">
        {error ? <span className="text-sm text-neg">{error}</span> : <span />}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button variant="accent" size="sm" onClick={confirm} disabled={!bitmap}>
            用这块识别
          </Button>
        </div>
      </div>
    </div>
  );
}
