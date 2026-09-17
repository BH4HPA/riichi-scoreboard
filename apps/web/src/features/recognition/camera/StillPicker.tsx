import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/ui/button";
import { loadPhoto } from "../photoFile";
import { BAND_DEFAULT, bandRect, clampCenter, type Rect } from "./band";
import { BandOverlay } from "./BandOverlay";

/**
 * 相册里挑一张来识别（标注模式常驻；房间里相机用不了时给）。用的还是同一条取景带：
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
  const [center, setCenter] = useState(0.5);
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
        fit: "contain",
      },
      band,
      center,
    );
    if (rect) onPick(bitmap, rect);
  };

  return (
    <div className="fixed inset-0 z-[76] flex flex-col bg-black" data-testid="still-picker">
      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden">
        {/* 照片完整显示（contain）：牌不一定在正中，裁边会把它裁没 */}
        <img
          src={url}
          alt=""
          // 不接事件：带外长按不弹 iOS 的图片菜单
          className="pointer-events-none absolute inset-0 h-full w-full max-w-none object-contain select-none"
        />
        <BandOverlay
          band={band}
          center={center}
          onBandChange={(b) => {
            setBand(b);
            setCenter((c) => clampCenter(c, b));
          }}
          onCenterChange={setCenter}
          hint="拖动框对准手牌，拉下沿调高度"
        />
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
