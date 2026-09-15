# 立直麻将计分板 v2

电视开 `/console` 显示房间二维码，手机扫码加入并远程操作计分；没带手机的玩家可由主控台添加为「本地玩家」；房间规则可配置，默认 M-League。打开首页时按设备分流：电脑直接进主控台，平板二选一，手机进加入页（HTTPS 下可网页扫码，否则输房间码）。

牌面录入使用扁平风格牌图（来源见 `apps/web/src/assets/tiles/NOTICE.md`），支持直接点选赤五；历史记录展示和牌手牌与役种；番符表按雀魂的结构呈现。

## 开发

```bash
corepack enable
yarn install
yarn dev        # server :8787 + web :5173（手机用电脑局域网 IP 访问 :5173）
yarn test       # 单测（core + server）
yarn e2e        # Playwright 端到端冒烟
```

## 部署

```bash
docker compose up -d --build   # 单容器，:8787，数据卷 /data（SQLite + 本地对象文件）
```

前端与后端同源部署时无需配置；前端单独托管到 COS 时，构建前设置 `VITE_API_BASE_URL`，在服务端设置 `CORS_ORIGINS`，并把 COS 静态站点的 404 回退到 `index.html`（`/console`、`/r/:code` 是前端路由）。

头像等用户文件默认落在 `DATA_DIR/objects`，由服务端在 `/api/objects/*` 托管；配置 `QCLOUD_*` 五项变量后改为直传腾讯云 COS（桶内 `riichi/` 前缀，URL 走 CDN 域名），变量清单见 `.env.template`。数据库结构按 `user_version` 自动迁移，升级镜像无需手工处理。

## 结构

- `packages/core` 规则、计分、reducer（纯 TS，前后端共用）
- `apps/server` Hono + WebSocket + SQLite，房间事件溯源，托管前端产物
- `apps/web` Vite + React，`/console` 电视端，`/r/:code` 手机端
