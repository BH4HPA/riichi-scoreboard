import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useSession } from "@/api/session";
import { api, ApiError } from "@/api/client";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { Input, Label } from "@/ui/controls";
import { useRoomStore } from "@/ws/store";
import { formatDateTime } from "@/lib/utils";

/** 浏览器端把图片缩放到 256px 正方形 JPEG，服务端只做校验。 */
async function resizeAvatar(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("无法生成图片"))), "image/jpeg", 0.85),
  );
}

export function ProfileEditor({
  onNameChange,
}: {
  onNameChange?: ((name: string) => void) | undefined;
}) {
  const { player, updateProfile, uploadAvatar } = useSession();
  const notify = useRoomStore((s) => s.notify);
  const [name, setName] = useState(player?.name ?? "");
  const [syncedName, setSyncedName] = useState(player?.name ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if ((player?.name ?? "") !== syncedName) {
    setSyncedName(player?.name ?? "");
    setName(player?.name ?? "");
  }
  if (!player) return null;

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === player.name) return;
    setBusy(true);
    try {
      await updateProfile({ name: trimmed });
      onNameChange?.(trimmed);
    } catch (err) {
      notify("error", err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadAvatar(await resizeAvatar(file));
    } catch (err) {
      notify("error", err instanceof ApiError ? err.message : "头像上传失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="relative"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-label="更换头像"
      >
        <Avatar name={player.name} src={player.avatar} size="xl" />
        <span className="absolute -bottom-1 -right-1 rounded-full bg-accent p-1.5 text-accent-fg shadow">
          <Camera className="h-3.5 w-3.5" />
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div className="flex-1">
        <Label>昵称</Label>
        <div className="mt-1 flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={12}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
          />
          <Button
            variant="outline"
            onClick={saveName}
            disabled={busy || !name.trim() || name.trim() === player.name}
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

interface Stats {
  games: number;
  averageRank: number | null;
  totalScore: number;
  rankCounts: [number, number, number, number];
  recent: Array<{
    room_code: string;
    game_no: number;
    finished_at: number;
    points: number;
    rank: number;
    score: number;
  }>;
}

export function StatsPanel() {
  const { token } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    if (!token) return;
    api<{ stats: Stats }>("/api/me/stats", { token })
      .then((r) => setStats(r.stats))
      .catch(() => setStats(null));
  }, [token]);
  if (!stats) return <p className="text-sm text-muted">加载中…</p>;
  if (stats.games === 0) return <p className="text-sm text-muted">还没有完成的对局。</p>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="对局" value={String(stats.games)} />
        <Stat label="平均顺位" value={stats.averageRank?.toFixed(2) ?? "—"} />
        <Stat
          label="累计得分"
          value={`${stats.totalScore > 0 ? "+" : ""}${stats.totalScore.toFixed(1)}`}
          tone={stats.totalScore >= 0 ? "pos" : "neg"}
        />
      </div>
      <div className="flex gap-1 text-xs text-muted">
        {stats.rankCounts.map((n, i) => (
          <span key={i} className="flex-1 rounded-md bg-surface-2 px-2 py-1 text-center">
            {i + 1} 位 × {n}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-border text-sm">
        {stats.recent.map((r) => (
          <li
            key={`${r.room_code}-${r.game_no}`}
            className="flex items-center justify-between py-1.5"
          >
            <span className="text-muted">{formatDateTime(r.finished_at)}</span>
            <span className="tabular">
              {r.rank} 位 · {r.points.toLocaleString("en-US")} ·{" "}
              <span className={r.score >= 0 ? "text-pos" : "text-neg"}>
                {r.score > 0 ? "+" : ""}
                {r.score.toFixed(1)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div
        className={`text-lg font-semibold tabular ${tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
