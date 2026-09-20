import { Link, useNavigate } from "react-router";
import { Swords, Users } from "lucide-react";
import { ROOM_KINDS, type RoomKind } from "@riichi/core";
import { Button } from "@/ui/button";
import { consolePath } from "./consoleRooms";
import { useSavedConsoleRooms } from "./useSavedConsoleRooms";

const KIND_INFO: Record<RoomKind, { name: string; hint: string; icon: typeof Users }> = {
  yonma: { name: "四人麻将", hint: "东风战 / 半庄，规则可配", icon: Users },
  ten: { name: "二人麻将", hint: "《天》规则：猜和牌张，限时 1 小时", icon: Swords },
};

/**
 * 首页的「开哪种房间」：每种房型一个主按钮。主控台会回到本机上次开的那个房间，所以按钮文案跟着走——
 * 确认那个房间还在就写「继续 … 房间码」，旁边给「新建」；确认没有才写「创建」；没法确认（正在问、断网）
 * 就只写房型名、不写动词。写了「创建」的按钮不会把人带进旧房间。
 */
export function RoomKindPicker() {
  const saved = useSavedConsoleRooms();
  const navigate = useNavigate();
  // 有房间可回（或可能可回）时，「创建」退成描边：高亮只留给最可能要点的那一个（同手机首页的「返回房间」与扫码）
  const resumable = ROOM_KINDS.some((kind) => saved[kind].state !== "none");
  return (
    <div className="grid gap-3">
      {ROOM_KINDS.map((kind) => {
        const { name, hint, icon: Icon } = KIND_INFO[kind];
        const room = saved[kind];
        const code = room.state === "open" ? room.code : null;
        return (
          <div key={kind} className="flex gap-2">
            <Button
              asChild
              size="lg"
              variant={room.state === "none" && resumable ? "outline" : "accent"}
              className="h-16 min-w-0 flex-1 justify-start"
              data-testid={`open-${kind}`}
            >
              <Link to={consolePath(kind)} aria-busy={room.state === "unknown"}>
                <Icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0 text-left">
                  <span className="block truncate">
                    {room.state === "unknown"
                      ? `${name}房间`
                      : code
                        ? `继续${name}房间 ${code}`
                        : `创建${name}房间`}
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
                // 只带上「要新建」的意图：本机记的房间码等新房建成才替换，建房失败时「继续」还在。
                // 旧房间留给还连着的人，闲置后服务端自会卸载
                onClick={() => void navigate(consolePath(kind), { state: { fresh: true } })}
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
