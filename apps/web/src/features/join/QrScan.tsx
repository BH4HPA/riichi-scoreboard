import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Button } from "@/ui/button";
import { roomCodeFrom } from "./roomCode";

/** 相机扫码：识别到房间码即回调并停止；HTTPS 下可用。 */
export function QrScan({
  onCode,
  onCancel,
}: {
  onCode: (code: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let done = false;
    const scanner = new QrScanner(
      video,
      (result) => {
        const code = roomCodeFrom(result.data);
        if (!code || done) return;
        done = true;
        scanner.stop();
        onCode(code);
      },
      { returnDetailedScanResult: true, highlightScanRegion: true, preferredCamera: "environment" },
    );
    scanner.start().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "无法打开相机");
    });
    return () => {
      scanner.destroy();
    };
  }, [onCode]);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
      </div>
      {error ? (
        <p className="text-sm text-neg">{error}，请改为输入房间码。</p>
      ) : (
        <p className="text-center text-sm text-muted">对准电视上的二维码</p>
      )}
      <Button variant="outline" className="w-full" onClick={onCancel}>
        取消扫码
      </Button>
    </div>
  );
}
