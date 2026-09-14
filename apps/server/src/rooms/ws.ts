import { randomBytes } from "node:crypto";
import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";
import { kyokuWind, type ClientMessage, type ServerMessage } from "@riichi/core";
import type { PlayersRepo } from "../db/players";
import { evaluateHand } from "../engine/evaluate";
import { describeError, type LiveRoom, type RoomClient, type RoomRegistry } from "./registry";

interface Deps {
  registry: RoomRegistry;
  players: PlayersRepo;
}

function parse(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const msg = JSON.parse(raw) as ClientMessage;
    return typeof msg === "object" && msg !== null && typeof msg.type === "string" ? msg : null;
  } catch {
    return null;
  }
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

      return {
        onOpen(_evt, ws) {
          try {
            room = deps.registry.get(code);
          } catch (err) {
            send(ws, { type: "error", id: null, ...describeError(err) });
            ws.close(4004, "room not found");
            return;
          }
          client = {
            clientId,
            playerId: player?.id ?? null,
            name: player?.name ?? "主控台",
            send: (m) => ws.send(m),
          };
          send(ws, { type: "welcome", clientId, playerId: player?.id ?? null });
          deps.registry.join(room, client);
        },
        onMessage(evt, ws) {
          if (!room || !client) return;
          const msg = parse(evt.data);
          if (!msg) {
            send(ws, { type: "error", id: null, code: "bad_message", message: "消息格式错误" });
            return;
          }
          switch (msg.type) {
            case "ping":
              send(ws, { type: "pong" });
              return;
            case "ui":
              deps.registry.setUi(room, client, msg.intent);
              return;
            case "evaluate": {
              const game = room.state.game?.present;
              if (!game) {
                send(ws, { type: "error", id: msg.id, code: "no_game", message: "尚未开局" });
                return;
              }
              try {
                const result = evaluateHand(
                  msg.hand,
                  { seat: msg.seat, dealer: game.dealer, roundWind: kyokuWind(game.kyoku) },
                  room.state.rules,
                );
                send(ws, { type: "evaluate", id: msg.id, result });
              } catch (err) {
                send(ws, { type: "error", id: msg.id, ...describeError(err) });
              }
              return;
            }
            case "command": {
              try {
                const event = deps.registry.apply(room, msg.baseSeq, msg.command, {
                  playerId: client.playerId,
                  clientId,
                });
                send(ws, { type: "ack", id: msg.id, seq: event.seq });
              } catch (err) {
                send(ws, { type: "error", id: msg.id, ...describeError(err) });
              }
              return;
            }
          }
        },
        onClose() {
          if (room) deps.registry.leave(room, clientId);
        },
        onError() {
          if (room) deps.registry.leave(room, clientId);
        },
      };
    }),
  );
}
