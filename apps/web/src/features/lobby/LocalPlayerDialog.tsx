import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, UserPlus } from "lucide-react";
import { WIND_LABELS, type LocalPlayerView, type Seat } from "@riichi/core";
import { ApiError } from "@/api/client";
import { useSession } from "@/api/session";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { Input, Label } from "@/ui/controls";
import { Dialog, DialogContent } from "@/ui/dialog";
import { useRoomStore } from "@/ws/store";
import { resizeAvatar } from "@/features/profile/avatarFile";
import { localsApi } from "./localsApi";

/**
 * 主控台「本地玩家」对话框：为某个空座选一个已有本地玩家或新建一个（昵称 + 头像）。
 * seat 为 null 时只管理档案，不入座。
 */
export function LocalPlayerDialog({
  seat,
  open,
  onOpenChange,
  seatedIds,
  onSit,
}: {
  seat: Seat | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 已在座位上的玩家 id（不可重复入座） */
  seatedIds: string[];
  onSit: (seat: Seat, playerId: string) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={seat === null ? "本地玩家" : `${WIND_LABELS[seat]}家 · 添加本地玩家`}
        description="本地玩家由主控台代为操作，不需要手机；档案保存在本设备。"
      >
        {open && (
          <LocalPlayerPanel
            seat={seat}
            seatedIds={seatedIds}
            onSit={async (playerId) => {
              if (seat === null) return;
              if (await onSit(seat, playerId)) onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LocalPlayerPanel({
  seat,
  seatedIds,
  onSit,
}: {
  seat: Seat | null;
  seatedIds: string[];
  onSit: (playerId: string) => Promise<void>;
}) {
  const ensure = useSession((s) => s.ensure);
  const notify = useRoomStore((s) => s.notify);
  const [locals, setLocals] = useState<LocalPlayerView[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    ensure()
      .then(({ token }) => localsApi.list(token))
      .then((list) => active && setLocals(list))
      .catch((err) => notify("error", err instanceof ApiError ? err.message : "加载失败"));
    return () => {
      active = false;
    };
  }, [ensure, notify]);

  const run = async (fn: (token: string) => Promise<void>) => {
    setBusy(true);
    try {
      const { token } = await ensure();
      await fn(token);
    } catch (err) {
      notify("error", err instanceof ApiError ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const replace = (next: LocalPlayerView) =>
    setLocals((list) => (list ?? []).map((l) => (l.id === next.id ? next : l)));

  const create = () =>
    run(async (token) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const local = await localsApi.create(token, trimmed);
      setLocals((list) => [...(list ?? []), local]);
      setName("");
      if (seat !== null) await onSit(local.id);
    });

  const pickAvatar = (id: string, file: File | undefined) => {
    if (!file) return;
    void run(async (token) =>
      replace(await localsApi.uploadAvatar(token, id, await resizeAvatar(file))),
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="local-name">新建本地玩家</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="local-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="昵称"
            maxLength={12}
          />
          <Button variant="accent" onClick={create} disabled={busy || !name.trim()}>
            <UserPlus className="h-4 w-4" /> {seat === null ? "创建" : "创建并入座"}
          </Button>
        </div>
      </div>

      <div>
        <Label>已有本地玩家</Label>
        {locals === null ? (
          <p className="mt-1 text-sm text-muted">加载中…</p>
        ) : locals.length === 0 ? (
          <p className="mt-1 text-sm text-muted">还没有本地玩家。</p>
        ) : (
          <ul className="mt-1 divide-y divide-border rounded-lg border border-border">
            {locals.map((l) => {
              const seated = seatedIds.includes(l.id);
              return (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                  <button
                    type="button"
                    className="relative"
                    onClick={() => {
                      setEditing(l.id);
                      fileRef.current?.click();
                    }}
                    disabled={busy}
                    aria-label={`更换 ${l.name} 的头像`}
                  >
                    <Avatar name={l.name} src={l.avatar} size="md" />
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-accent p-0.5 text-accent-fg">
                      <Camera className="h-3 w-3" />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <Input
                      defaultValue={l.name}
                      maxLength={12}
                      className="h-8 text-sm"
                      aria-label="昵称"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== l.name)
                          void run(async (token) =>
                            replace(await localsApi.rename(token, l.id, v)),
                          );
                      }}
                    />
                    <div className="mt-0.5 text-[11px] text-muted">
                      {l.games} 局{seated ? " · 已入座" : ""}
                    </div>
                  </div>
                  {seat !== null && (
                    <Button
                      size="sm"
                      variant="accent"
                      disabled={busy || seated}
                      onClick={() => onSit(l.id)}
                    >
                      入座
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted hover:text-neg"
                    aria-label={`删除 ${l.name}`}
                    disabled={busy || seated}
                    onClick={() =>
                      run(async (token) => {
                        await localsApi.remove(token, l.id);
                        setLocals((list) => (list ?? []).filter((x) => x.id !== l.id));
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (editing) pickAvatar(editing, e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
