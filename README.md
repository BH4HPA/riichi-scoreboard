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

### 线上（GitHub Actions → 腾讯云）

`.github/workflows/cicd.yml`：每次推送与 PR 跑门禁（typecheck / lint / format / 单测 / e2e）；推到 `main` 后并行发布——前端构建后由 `ci/deploy-web-to-cos.sh` 镜像同步到 COS 静态站桶并刷新 CDN（`https://riichi.ruivon.cn`），服务端镜像推到 CCR 后经 SSH 在服务器执行 `ci/deploy-server.sh <sha7>`（`https://riichi-api.ruivon.cn`，HTTP 与 WebSocket 同一端口，经 CDN 回源）。

- 手动发布 / 回滚：在 Actions 里对任意提交 `Run workflow`，前端与服务端按同一提交重建。
- 服务器上只通过 `ci/deploy-server.sh` 起服务：它先读 `~/.env`（云密钥、static 桶、CCR 登录）再读仓库 `.env`（`RIICHI_IMAGE` / `RIICHI_PORT` / `CORS_ORIGINS`），`--no-build` 只拉镜像。直接 `docker compose up` 会在服务器上本地构建，且缺少密钥时会静默退回本地存储模式。
- 镜像内仍包含同源模式的前端产物（本地与开发机 compose 需要），所以接口域名下也能打开一个计分板，但那不是正式入口，二维码会指向接口域名。
- 仓库 secrets：`QCLOUD_SECRET_ID` / `QCLOUD_SECRET_KEY`（COS 上传 + CDN 刷新）、`QCLOUD_DOCKER_USERNAME` / `QCLOUD_DOCKER_PASSWORD`（CCR）、`DEPLOY_SSH_HOST` / `DEPLOY_SSH_KEY` / `DEPLOY_KNOWN_HOSTS`（部署机）。桶名、域名、镜像名等常量写在工作流的 `env` 里。
- 腾讯云 CDN 对约 10 秒无数据的 WebSocket 会静默回收，客户端每 5 秒发心跳、8 秒无回包即重连，接口响应带 `Cache-Control: no-store`；CDN 侧接口域名仍应配置为不缓存。

头像等用户文件默认落在 `DATA_DIR/objects`，由服务端在 `/api/objects/*` 托管；配置 `QCLOUD_*` 五项变量后改为直传腾讯云 COS（桶内 `riichi/` 前缀，URL 走 CDN 域名），变量清单见 `.env.template`。数据库结构按 `user_version` 自动迁移，升级镜像无需手工处理；从 v1 数据升级时头像字段会被清空（旧的 `DATA_DIR/avatars` 目录不再使用，可手动删除），玩家重新上传即可。

## 结构

- `packages/core` 规则、计分、reducer（纯 TS，前后端共用）
- `apps/server` Hono + WebSocket + SQLite，房间事件溯源，托管前端产物
- `apps/web` Vite + React，`/console` 电视端，`/r/:code` 手机端
