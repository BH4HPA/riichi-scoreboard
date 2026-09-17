import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import {
  canRiichi,
  MUSIC_TRACKS,
  seatNames,
  type GameState,
  type RoomRules,
  type Seat,
} from "@riichi/core";
import { Button } from "@/ui/button";
import { useRoomStore } from "@/ws/store";
import { useCommand, useSocket } from "@/ws/useRoom";
import { musicLabel } from "./label";
import { defaultTrack, orderTracks, withLast, withPick } from "./prefs";
import { TrackPicker } from "./TrackPicker";
import { useMusicPrefs } from "./useMusicPrefs";

/**
 * 操作栏「对局中」一节：选曲 + 「▶ 立直」。在座的手机按下 = 声明本局立直（结算表单据此预勾）+ 电视放曲；
 * 主控台（无座位）代按只放曲。点数不足且规则不允许立直时禁用。下方一行显示谁在放哪首。
 */
export function RiichiSection({
  game,
  rules,
  mySeat,
  size,
}: {
  game: GameState;
  rules: RoomRules;
  mySeat: Seat | null;
  size: "sm" | "md" | "lg";
}) {
  const socket = useSocket();
  const send = useCommand();
  const notify = useRoomStore((s) => s.notify);
  const room = useRoomStore((s) => s.room);
  const [prefs, update] = useMusicPrefs();
  const ordered = useMemo(() => orderTracks(MUSIC_TRACKS, prefs), [prefs]);
  const [value, setValue] = useState<string | null>(() => defaultTrack(ordered, prefs));

  const select = (id: string) => {
    setValue(id);
    update((p) => withLast(p, id));
  };
  const blocked =
    game.status === "finished" || (mySeat !== null && !canRiichi(game, rules, mySeat));
  const riichi = () => {
    if (!value) return;
    if (mySeat !== null && !game.riichi[mySeat]) void send({ type: "declareRiichi", seat: mySeat });
    if (!socket.music(value)) return notify("error", "连接已断开");
    update((p) => withPick(p, value));
  };
  const music = room?.music ?? null;

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium text-muted">对局中</h3>
      <div className="flex items-center gap-1.5">
        <TrackPicker tracks={ordered} value={value} onChange={select} size={size} />
        <Button size={size} variant="accent" disabled={blocked || !value} onClick={riichi}>
          <Play className="h-4 w-4" fill="currentColor" /> 立直
        </Button>
      </div>
      {music && room && (
        <p className="mt-1.5 text-xs text-muted">▶ {musicLabel(music, seatNames(room))}</p>
      )}
    </section>
  );
}
