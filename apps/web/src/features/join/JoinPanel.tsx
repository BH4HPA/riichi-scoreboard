import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { ScanLine, Smartphone } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { useSession } from "@/api/session";
import { canScanQr } from "@/lib/device";
import { Button } from "@/ui/button";
import { CodeInput } from "./CodeInput";
import { QrScan } from "./QrScan";

/** 手机加入：扫码（需 HTTPS）或输入 6 位房间码，输满自动校验并进房。 */
export function JoinPanel() {
  const navigate = useNavigate();
  const ensure = useSession((s) => s.ensure);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [scanning, setScanning] = useState(false);
  const scannable = canScanQr();
  const go = useCallback((c: string) => navigate(`/r/${c.toUpperCase()}`), [navigate]);

  const check = async (c: string) => {
    setChecking(true);
    setError(null);
    try {
      const { token } = await ensure();
      await api(`/api/rooms/${c}`, { token });
      go(c);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        setError(err.status === 410 ? "这个房间已解散" : "房间不存在，请核对房间码");
        setShakeKey((k) => k + 1);
      } else {
        setError("无法连接服务器，请稍后再试");
      }
    } finally {
      setChecking(false);
    }
  };

  if (scanning) {
    return <QrScan onCode={go} onCancel={() => setScanning(false)} />;
  }
  return (
    <div className="space-y-3">
      {scannable ? (
        <Button size="lg" variant="accent" className="w-full" onClick={() => setScanning(true)}>
          <ScanLine className="h-5 w-5" /> 扫描主控台二维码
        </Button>
      ) : (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          当前页面不是
          HTTPS，无法在网页里调用相机；请用手机相机或微信扫码打开链接，或直接输入房间码。
        </p>
      )}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Smartphone className="h-4 w-4" /> 输入房间码
        </div>
        <CodeInput
          value={code}
          onChange={(c) => {
            setCode(c);
            setError(null);
          }}
          onComplete={check}
          shakeKey={shakeKey}
          invalid={error !== null}
          disabled={checking}
        />
        {(error || checking) && (
          <p
            className={error ? "mt-2 text-sm text-neg" : "mt-2 text-xs text-muted"}
            aria-live="polite"
          >
            {error ?? "正在确认房间…"}
          </p>
        )}
      </div>
    </div>
  );
}
