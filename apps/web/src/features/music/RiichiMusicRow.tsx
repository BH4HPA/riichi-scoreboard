import { useMemo, useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import { seatNames } from "@riichi/core";
import { Button } from "@/ui/button";
import { useRoomStore } from "@/ws/store";
import { useSocket } from "@/ws/useRoom";
import { useMusicCatalog } from "./catalog";
import { musicLabel } from "./label";
import { defaultTrack, orderTracks, withLast, withPick } from "./prefs";
import { TrackPicker } from "./TrackPicker";
import { useMusicPrefs } from "./useMusicPrefs";

/**
 * 选曲 + 「▶ 立直」+ 「谁在放哪首」：与对局模型无关的那一半。
 * 按下时先调 `onPress`（各房型在这里记自己的立直），再让电视放曲；记分优先，没选到曲目只是不放音乐。
 */
export function RiichiMusicRow({
  size,
  blocked,
  needsTrack,
  onPress,
  children,
}: {
  size: "sm" | "md" | "lg";
  blocked: boolean;
  /** 按下只为放曲（主控台代按）：没有曲目就没有可做的事，按钮禁用 */
  needsTrack: boolean;
  onPress?: () => void;
  /** 跟在「▶ 立直」后面的同排按钮 */
  children?: ReactNode;
}) {
  const socket = useSocket();
  const notify = useRoomStore((s) => s.notify);
  const room = useRoomStore((s) => s.room);
  const [prefs, update] = useMusicPrefs();
  const tracks = useMusicCatalog();
  const ordered = useMemo(() => orderTracks(tracks, prefs), [tracks, prefs]);
  const [picked, setPicked] = useState<string | null>(null);
  // 清单是异步到的：没手动选过就跟着清单取默认曲
  const value = picked ?? defaultTrack(ordered, prefs);

  const select = (id: string) => {
    setPicked(id);
    update((p) => withLast(p, id));
  };
  const press = () => {
    onPress?.();
    if (!value) return;
    if (!socket.music(value)) return notify("error", "连接已断开");
    update((p) => withPick(p, value));
  };
  const music = room?.music ?? null;

  return (
    <>
      <div className="flex items-center gap-1.5">
        {ordered.length > 0 && (
          <TrackPicker tracks={ordered} value={value} onChange={select} size={size} />
        )}
        <Button
          size={size}
          variant="accent"
          disabled={blocked || (needsTrack && !value)}
          onClick={press}
        >
          <Play className="h-4 w-4" fill="currentColor" /> 立直
        </Button>
        {children}
      </div>
      {music && room && (
        <p className="mt-1.5 text-xs text-muted">▶ {musicLabel(music, seatNames(room), tracks)}</p>
      )}
    </>
  );
}
