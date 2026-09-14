import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const shell = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: shell });
const { app, registry } = createApp({ config, upgradeWebSocket });
shell.route("/", app);

const server = serve({ fetch: shell.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(
    `riichi server listening on http://${info.address}:${info.port} (data: ${config.dataDir})`,
  );
});
injectWebSocket(server);

setInterval(() => registry.evictIdle(config.roomIdleMs), 10 * 60 * 1000).unref();
