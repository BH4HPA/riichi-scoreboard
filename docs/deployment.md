# 部署与运维

## 同源部署（最简单）

```bash
docker compose up -d --build   # 单容器，:8787，数据卷 /data（SQLite + 本地对象文件）
```

服务端同时托管前端构建产物，不需要额外配置。

前端单独托管（例如放到 COS 静态站）时，需要：

- 构建前端前设置 `VITE_API_BASE_URL`；
- 服务端设置 `CORS_ORIGINS`；
- 把静态站点的 404 回退到 `index.html`（`/console`、`/r/:code` 都是前端路由）。

## 线上（GitHub Actions → 腾讯云）

| 域名                           | 指向                                       |
| ------------------------------ | ------------------------------------------ |
| `https://riichi.ruivon.cn`     | CDN → COS 静态站桶（前端）                 |
| `https://riichi-api.ruivon.cn` | CDN → 服务器（HTTP 与 WebSocket 同一端口） |

工作流 `.github/workflows/cicd.yml` 在每次推送和 PR 时跑门禁：typecheck、lint、format、单测、e2e。推到 `main` 后并行发布两端：

- **前端**：构建后，`ci/deploy-web-to-cos.sh` 把产物镜像同步到 COS（走全球加速域名），然后刷新 CDN。接着 `ci/verify-web-deploy.sh` 逐个核对 `dist` 里的文件确实能从线上取到：比对大小，并检查 `.wasm` 的类型。只传上去一部分的半截部署会让工作流失败。长缓存头在上传时就写进源站对象；CDN 会按自己的规则改写响应头，所以校验时不检查缓存头。
- **服务端**：镜像推到 CCR，再经 SSH 在服务器上执行 `ci/deploy-server.sh <sha7>`。

注意事项：

- **手动发布 / 回滚**：在 Actions 里对任意提交点 `Run workflow`，前端和服务端按同一个提交重建。回滚到「前端发布走全球加速」之前的提交时，前端作业用的是那个提交自带的旧脚本：走区域域名，每次都强制重传 14 MB 的 wasm。境外 runner 很可能因此报 `UserNetworkTooSlow` 失败，而服务端作业照常成功，前后端版本就对不上了。遇到这种情况，要么只回滚服务端，要么把这次的 `ci/` 改动 cherry-pick 到回滚分支上再发。
- **服务器上只通过 `ci/deploy-server.sh` 起服务**：脚本先读 `~/.env`（云密钥、static 桶、CCR 登录），再读仓库里的 `.env`（`RIICHI_IMAGE` / `RIICHI_PORT` / `CORS_ORIGINS`），用 `--no-build` 只拉镜像。直接执行 `docker compose up` 会在服务器上本地构建，缺少密钥时还会静默退回本地存储模式。
- **镜像里仍然带着前端产物**，供本地和开发机的同源 compose 使用。线上在服务器 `.env` 里设 `WEB_DIST=`（留空）关闭静态托管，接口域名下的页面路径会 302 到正式站点。
- **仓库 secrets**：
  - `QCLOUD_SECRET_ID` / `QCLOUD_SECRET_KEY`：COS 上传和 CDN 刷新
  - `QCLOUD_DOCKER_USERNAME` / `QCLOUD_DOCKER_PASSWORD`：CCR
  - `DEPLOY_SSH_HOST` / `DEPLOY_SSH_KEY` / `DEPLOY_KNOWN_HOSTS`：部署机

  桶名、域名、镜像名等常量写在工作流的 `env` 里。

- **WebSocket 保活**：腾讯云 CDN 会静默回收约 10 秒没有数据的 WebSocket。客户端每 5 秒发一次心跳，8 秒收不到回包就重连。接口响应带 `Cache-Control: no-store`，CDN 侧的接口域名也要配置成不缓存。

## PWA

前端只提供 `manifest.json` 和图标，**不注册 Service Worker**：

- 离开 WebSocket，页面本来就用不了，离线缓存没有意义；
- 用 SW 缓存 index 反而可能把用户卡在旧版本；
- 「添加到主屏幕」不依赖 SW。

iOS 从主屏打开的应用和 Safari 的 localStorage 互不相通，所以同一台手机在两边是两个玩家身份。扫描二维码时，系统相机总是用 Safari 打开链接。丢了身份的手机可以让离线的旧座位离座，再重新坐回去。

## 用户文件与数据库

头像等用户文件默认存放在 `DATA_DIR/objects`，由服务端在 `/api/objects/*` 下提供访问。配好 `QCLOUD_*` 五项变量后，改为直传腾讯云 COS（桶内加 `riichi/` 前缀，URL 走 CDN 域名），变量清单见 `.env.template`。

数据库结构按 `user_version` 自动迁移，升级镜像无需手工处理。从 v1 数据升级时，头像字段会被清空（旧的 `DATA_DIR/avatars` 目录不再使用，可以手动删掉），玩家重新上传即可。

## 曲库（立直音乐）

曲库清单在 `packages/core/src/music/manifest.json`，字段含义：

- `id`：桶内对象名（uuid）
- `title`：展示名
- `file`：本地原文件名

音频固定从 `https://static.bitego.net/riichi/music/<id>.mp3` 播放（常量在 `apps/web/src/features/music/url.ts`），服务端和前端都不需要额外配置。

加曲步骤：

1. 在 manifest 里追加一条，`id` 用 `uuidgen | tr A-Z a-z` 生成（必须小写）；
2. 在本机执行 `QCLOUD_SECRET_ID=… QCLOUD_SECRET_KEY=… ci/upload-music.sh <放原文件的目录>`（需要先 `pipx install coscmd`）；
3. 推到 `main`。

## 识别模型发布

类目录和当前发布的模型记录在 `packages/core/src/recognition/manifest.json`，模型对象放在 `https://static.bitego.net/riichi/models/<id>.onnx`。`ci/upload-model.sh` 负责校验、上传，并把 `model` 字段写回 manifest；`model` 为 `null` 时，手机上不显示拍照识别入口。训练流程见 [`ml/README.md`](../ml/README.md)。
