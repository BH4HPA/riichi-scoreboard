import { Link, useNavigate } from "react-router";
import { Swords, Users } from "lucide-react";
import { ROOM_KINDS, type RoomKind } from "@riichi/core";
import { Button } from "@/ui/button";
import { consolePath, forgetConsoleRoom } from "./consoleRooms";
import { useSavedConsoleRooms } from "./useSavedConsoleRooms";

const KIND_INFO: Record<RoomKind, { name: string; hint: string; icon: typeof Users }> = {
  yonma: { name: "四人麻将", hint: "东风战 / 半庄，规则可配", icon: Users },
  ten: { name: "二人麻将", hint: "《天》规则：猜和牌张，限时 1 小时", icon: Swords },
};

/**
 * 首页的「开哪种房间」：每种房型一个主按钮。主控台会回到本机上次开的那个房间，所以按钮文案跟着走——
 * 那个房间还在就写「继续 … 房间码」，旁边给「新建」；没有才写「创建」。点了「创建」不会进到旧房间。
 */
export function RoomKindPicker() {
  const saved = useSavedConsoleRooms();
  const navigate = useNavigate();
  return (
    <div className="grid gap-3">
      {ROOM_KINDS.map((kind) => {
        const { name, hint, icon: Icon } = KIND_INFO[kind];
        const { code, pending } = saved[kind];
        return (
          <div key={kind} className="flex gap-2">
            <Button
              asChild
              size="lg"
              variant="accent"
              className="h-16 min-w-0 flex-1 justify-start"
              data-testid={`open-${kind}`}
            >
              <Link to={consolePath(kind)} aria-busy={pending}>
                <Icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0 text-left">
                  {/* 确认期间不写动词：回来时只补上房间码，不会从「创建」跳成「继续」 */}
                  <span className="block truncate">
                    {pending ? name : code ? `继续${name}房间 ${code}` : `创建${name}房间`}
                  </span>
                  <span className="block truncate text-xs font-normal opacity-80">{hint}</span>
                </span>
              </Link>
            </Button>
            {code && (
              <Button
                size="lg"
                variant="outline"
                className="h-16 shrink-0"
                data-testid={`new-${kind}`}
                onClick={() => {
                  // 旧房间留给还连着的人，闲置后服务端自会卸载；本机只是不再回到它
                  forgetConsoleRoom(kind);
                  navigate(consolePath(kind));
                }}
              >
                新建
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
