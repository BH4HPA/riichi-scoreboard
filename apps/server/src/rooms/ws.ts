import { randomBytes } from "node:crypto";
import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";
import { dealerOf, kyokuWind, type ClientMessage, type ServerMessage } from "@riichi/core";
import type { PlayersRepo } from "../db/players";
import { evaluateHand } from "../engine/evaluate";
import {
  describeError,
  RoomClosed,
  WS_CLOSE_DISSOLVED,
  type LiveRoom,
  type RoomClient,
  type RoomRegistry,
} from "./registry";

interface Deps {
  registry: RoomRegistry;
  players: PlayersRepo;
}

/** 单条消息上限：一手牌面 + 元数据远小于此。 */
const MAX_MESSAGE_BYTES = 16 * 1024;

function parse(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return null;
  try {
    const msg = JSON.parse(raw) as ClientMessage;
    return typeof msg === "object" && msg !== null && typeof msg.type === "string" ? msg : null;
  } catch {
    return null;
  }
}

function messageId(msg: { id?: unknown }): string | null {
  return typeof msg.id === "string" && msg.id.length <= 64 ? msg.id : null;
}

export function mountWebSocket(app: Hono, upgradeWebSocket: UpgradeWebSocket, deps: Deps): void {
  app.get(
    "/ws",
    upgradeWebSocket((c) => {
      const code = (c.req.query("room") ?? "").toUpperCase();
      const token = c.req.query("token") ?? "";
      const player = token ? deps.players.byToken(token) : null;
      const clientId = randomBytes(6).toString("hex");
      let room: LiveRoom | null = null;
      let client: RoomClient | null = null;

      const send = (ws: WSContext, message: ServerMessage) => ws.send(JSON.stringify(message));
      const fail = (ws: WSContext, id: string | null, err: unknown) => {
        const info = describeError(err);
        if (info.internal) console.error(`[ws] room=${code} client=${clientId}`, err);
        send(ws, { type: "error", id, code: info.code, message: info.message });
      };

      return {
        onOpen(_evt, ws) {
          if (!player) {
            send(ws, {
              type: "error",
              id: null,
              code: "unauthorized",
              message: "需要有效的设备 token",
            });
            ws.close(4001, "unauthorized");
            return;
          }
          try {
            room = deps.registry.get(code);
          } catch (err) {
            fail(ws, null, err);
            ws.close(err instanceof RoomClosed ? WS_CLOSE_DISSOLVED : 4004, "room unavailable");
            return;
          }
          client = {
            clientId,
            playerId: player.id,
            name: player.name,
            send: (m) => ws.send(m),
            close: (c, r) => ws.close(c, r),
          };
          send(ws, { type: "welcome", playerId: player.id });
          try {
            deps.registry.join(room, client);
          } catch (err) {
            fail(ws, null, err);
          }
        },
        onMessage(evt, ws) {
          if (!room || !client) return;
          const msg = parse(evt.data);
          if (!msg) {
            send(ws, {
              type: "error",
              id: null,
              code: "bad_message",
              message: "消息格式错误或过大",
            });
            return;
          }
          switch (msg.type) {
            case "ping":
              send(ws, { type: "pong" });
              return;
            case "ui":
              try {
                deps.registry.setUi(room, client, msg.intent);
              } catch (err) {
                fail(ws, null, err);
              }
              return;
            case "evaluate": {
              const id = messageId(msg);
              const game = room.state.game?.present;
              if (!game) {
                send(ws, { type: "error", id, code: "no_game", message: "尚未开局" });
                return;
              }
              try {
                const result = evaluateHand(
                  msg.hand,
                  {
                    seat: msg.seat,
                    dealer: dealerOf(game.kyoku),
                    roundWind: kyokuWind(game.kyoku),
                  },
                  room.state.rules,
                );
                send(ws, { type: "evaluate", id: id ?? "", result });
              } catch (err) {
                fail(ws, id, err);
              }
              return;
            }
            case "command": {
              const id = messageId(msg);
              if (typeof msg.baseSeq !== "number") {
                send(ws, { type: "error", id, code: "bad_message", message: "缺少 baseSeq" });
                return;
              }
              try {
                const event = deps.registry.apply(room, msg.baseSeq, msg.command, {
                  playerId: client.playerId,
                  clientId,
                });
                send(ws, { type: "ack", id: id ?? "", seq: event.seq });
                if (room.state.phase === "closed") deps.registry.closeRoom(room);
              } catch (err) {
                fail(ws, id, err);
              }
              return;
            }
            default:
              send(ws, { type: "error", id: null, code: "bad_message", message: "未知消息类型" });
          }
        },
        onClose() {
          if (room) deps.registry.leave(room, clientId);
        },
        onError(err) {
          console.error(`[ws] room=${code} client=${clientId} socket error`, err);
          if (room) deps.registry.leave(room, clientId);
        },
      };
    }),
  );
}
