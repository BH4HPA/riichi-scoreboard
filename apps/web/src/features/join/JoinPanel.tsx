import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { ScanLine, Smartphone } from "lucide-react";
import { canScanQr } from "@/lib/device";
import { Button } from "@/ui/button";
import { Input } from "@/ui/controls";
import { QrScan } from "./QrScan";

/** 手机加入：扫码（需 HTTPS）或输入 6 位房间码。 */
export function JoinPanel() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const scannable = canScanQr();
  // 稳定引用：QrScan 以它为 effect 依赖，避免每次渲染重建扫描器
  const go = useCallback((c: string) => navigate(`/r/${c.toUpperCase()}`), [navigate]);

  if (scanning) {
    return <QrScan onCode={go} onCancel={() => setScanning(false)} />;
  }
  return (
    <div className="space-y-3">
      {scannable ? (
        <Button size="lg" variant="accent" className="w-full" onClick={() => setScanning(true)}>
          <ScanLine className="h-5 w-5" /> 扫描电视上的二维码
        </Button>
      ) : (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          当前页面不是
          HTTPS，无法在网页里调用相机；请用手机相机或微信扫码打开链接，或直接输入房间码。
        </p>
      )}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Smartphone className="h-4 w-4" /> 输入房间码加入
        </div>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && code.trim().length === 6 && go(code.trim())}
            placeholder="6 位房间码"
            maxLength={6}
            autoCapitalize="characters"
            aria-label="房间码"
            className="tabular tracking-[0.3em] uppercase"
          />
          <Button onClick={() => go(code.trim())} disabled={code.trim().length !== 6}>
            加入
          </Button>
        </div>
      </div>
    </div>
  );
}
