import { useEffect, useMemo, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/ui/button";
import { ChipGroup } from "@/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/ui/dialog";
import { useRoomStore } from "@/ws/store";
import { cropPhoto, loadPhoto } from "./photoFile";

/** 裁剪框比例：手牌一行 + 上方指示牌约 3:1；副露放上下时更接近 2:1 或 4:3 */
const ASPECTS = [
  { value: 3, label: "3:1" },
  { value: 2, label: "2:1" },
  { value: 4 / 3, label: "4:3" },
];

export interface CroppedPhoto {
  blob: Blob;
  bitmap: ImageBitmap;
}

/**
 * 拍照后先裁剪：把手牌、副露和指示牌框进来，牌河、杂牌、风位盒裁掉。
 * 上传与识别用的都是裁剪后的图（长边 ≤1280）。换一张照片即整体重挂载，状态不残留。
 */
export function CropDialog({
  file,
  onConfirm,
  onCancel,
}: {
  file: File | null;
  onConfirm: (photo: CroppedPhoto) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent title="裁剪照片" description="框住手牌、副露和宝牌指示牌，把牌河裁掉">
        {file && (
          <CropBody
            key={`${file.name}-${file.size}-${file.lastModified}`}
            file={file}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CropBody({
  file,
  onConfirm,
  onCancel,
}: {
  file: File;
  onConfirm: (photo: CroppedPhoto) => void;
  onCancel: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    let cancelled = false;
    let loaded: ImageBitmap | null = null;
    loadPhoto(file)
      .then((b) => {
        loaded = b;
        if (!cancelled) setBitmap(b);
      })
      .catch(() => {
        if (cancelled) return;
        useRoomStore.getState().notify("error", "无法读取这张照片");
        onCancelRef.current();
      });
    return () => {
      cancelled = true;
      loaded?.close();
    };
  }, [file]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(2);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!bitmap || !area) return;
    setBusy(true);
    try {
      onConfirm(await cropPhoto(bitmap, area));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="relative h-[55dvh] w-full overflow-hidden rounded-lg bg-black"
        data-testid="crop-area"
      >
        <Cropper
          image={url}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          minZoom={1}
          maxZoom={4}
          objectFit="contain"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
        />
      </div>
      <ChipGroup value={aspect} onChange={setAspect} options={ASPECTS} className="mt-3" />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button variant="accent" onClick={confirm} disabled={!bitmap || !area || busy}>
          确认裁剪
        </Button>
      </DialogFooter>
    </>
  );
}
