# 立直麻将计分板 v2

电视开 `/console` 显示房间二维码，四台手机扫码加入并远程操作计分；房间规则可配置，默认 M-League。

## 开发

```bash
corepack enable
yarn install
yarn dev        # server :8787 + web :5173（手机用电脑局域网 IP 访问 :5173）
yarn test
```

## 结构

- `packages/core` 规则、计分、reducer（纯 TS，前后端共用）
- `apps/server` Hono + WebSocket + SQLite，房间事件溯源，托管前端产物
- `apps/web` Vite + React，`/console` 电视端，`/r/:code` 手机端
