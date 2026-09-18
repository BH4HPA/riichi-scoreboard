import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { MAX_MESSAGE_BYTES } from "./rooms/ws";

const config = loadConfig();
const shell = new Hono();
const { injectWebSocket, upgradeWebSocket, wss } = createNodeWebSocket({ app: shell });
// ws 默认允许 100 MiB 的单帧并在内存里拼完才交付；应用层的长度校验拦不住分片攻击
wss.options.maxPayload = MAX_MESSAGE_BYTES;
const { app, registry, db } = createApp({ config, upgradeWebSocket });
shell.route("/", app);

const server = serve({ fetch: shell.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(
    `riichi server listening on http://${info.address}:${info.port} (data: ${config.dataDir})`,
  );
});
injectWebSocket(server);

const sweeper = setInterval(() => registry.evictIdle(config.roomIdleMs), 10 * 60 * 1000);
sweeper.unref();

function shutdown(signal: string): void {
  console.log(`received ${signal}, shutting down`);
  clearInterval(sweeper);
  for (const socket of wss.clients) socket.close(1001, "server shutdown");
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
