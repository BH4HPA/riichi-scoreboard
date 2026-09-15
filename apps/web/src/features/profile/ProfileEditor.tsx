import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { formatPoints, formatScore, type PlayerStats } from "@riichi/core";
import { useSession } from "@/api/session";
import { api, ApiError } from "@/api/client";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { Input, Label } from "@/ui/controls";
import { useRoomStore } from "@/ws/store";
import { cn, formatDateTime } from "@/lib/utils";
import { resizeAvatar } from "./avatarFile";

/** 昵称与头像：保存到玩家档案，服务端会同步到已入座的房间。 */
export function ProfileEditor() {
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
        <Label htmlFor="profile-name">昵称</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="profile-name"
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

export function StatsPanel() {
  const { token } = useSession();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  useEffect(() => {
    if (!token) return;
    api<{ stats: PlayerStats }>("/api/me/stats", { token })
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
          value={formatScore(stats.totalScore)}
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
            key={`${r.roomCode}-${r.gameNo}`}
            className="flex items-center justify-between py-1.5"
          >
            <span className="text-muted">{formatDateTime(r.finishedAt)}</span>
            <span className="tabular">
              {r.rank} 位 · {formatPoints(r.points)} ·{" "}
              <span className={r.score >= 0 ? "text-pos" : "text-neg"}>{formatScore(r.score)}</span>
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
        className={cn(
          "text-lg font-semibold tabular",
          tone === "pos" && "text-pos",
          tone === "neg" && "text-neg",
        )}
      >
        {value}
      </div>
    </div>
  );
}
