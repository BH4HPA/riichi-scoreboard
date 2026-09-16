# 立直麻将计分板 v2

电视开 `/console` 显示房间二维码，手机扫码加入并远程操作计分；没带手机的玩家可由主控台添加为「本地玩家」；房间规则可配置，默认 M-League。打开首页时按设备分流：电脑直接进主控台，平板二选一，手机进加入页（HTTPS 下可网页扫码，否则输房间码）。

牌面录入使用扁平风格牌图（来源见 `apps/web/src/assets/tiles/NOTICE.md`），支持直接点选赤五；历史记录展示和牌手牌与役种；番符表按雀魂的结构呈现。

## 开发

```bash
corepack enable
yarn install
yarn dev        # server :8787 + web :5173（HTTPS，手机用电脑局域网 IP 访问 :5173）
yarn test       # 单测（core + server）
yarn e2e        # Playwright 端到端冒烟
```

`yarn dev` 的前端走 HTTPS（`vite-plugin-mkcert` 自动签本机与局域网 IP 的证书）：拍照识别的取景框用
`getUserMedia`，只在安全上下文可用，手机通过局域网 IP 走 HTTP 会被浏览器直接拒绝。

手机上要**一次性**信任 mkcert 的根证书，之后本机与开发机都不用再管：

1. 本机 `mkcert -CAROOT` 找到 `rootCA.pem`，AirDrop / 邮件发到手机；
2. iOS：打开后在 设置 → 通用 → VPN 与设备管理 里安装描述文件；
3. **设置 → 通用 → 关于本机 → 证书信任设置 里打开这张证书的完全信任**（不做这步仍然不是安全上下文）。

开发机（boxdev）上验收取景框同样需要 HTTPS，容器本身是纯 HTTP，所以叠一层 caddy 做 TLS 终结：

```bash
# 本机：签一张同时覆盖开发机 IP 的证书（与上面同一个根 CA，手机不用再装第二次）
mkcert -cert-file cert.pem -key-file key.pem <开发机 IP> localhost
rsync cert.pem key.pem boxdev:~/riichi-scoreboard/ci/dev-tls/certs/   # 证书不入库
# 开发机：
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
# 手机开 https://<开发机 IP>:8443
```

## 部署

```bash
docker compose up -d --build   # 单容器，:8787，数据卷 /data（SQLite + 本地对象文件）
```

前端与后端同源部署时无需配置；前端单独托管到 COS 时，构建前设置 `VITE_API_BASE_URL`，在服务端设置 `CORS_ORIGINS`，并把 COS 静态站点的 404 回退到 `index.html`（`/console`、`/r/:code` 是前端路由）。

### 线上（GitHub Actions → 腾讯云）

`.github/workflows/cicd.yml`：每次推送与 PR 跑门禁（typecheck / lint / format / 单测 / e2e）；推到 `main` 后并行发布——前端构建后由 `ci/deploy-web-to-cos.sh` 镜像同步到 COS 静态站桶（走全球加速域名）并刷新 CDN，再由 `ci/verify-web-deploy.sh` 逐个核对 `dist` 里的文件真的能从 `https://riichi.ruivon.cn` 取到（比大小与 `.wasm` 的类型；长缓存头在上传时写进源站对象，CDN 会按自己的规则改写响应头，所以不在这里判），个别对象没传上去的半截部署会让工作流失败，服务端镜像推到 CCR 后经 SSH 在服务器执行 `ci/deploy-server.sh <sha7>`（`https://riichi-api.ruivon.cn`，HTTP 与 WebSocket 同一端口，经 CDN 回源）。

- 手动发布 / 回滚：在 Actions 里对任意提交 `Run workflow`，前端与服务端按同一提交重建。回滚到「前端发布走全球加速」之前的提交时，前端作业用的是那个提交自带的旧脚本（区域域名 + 每次强制重传 14 MB 的 wasm），境外 runner 上很可能再次 `UserNetworkTooSlow` 失败而服务端作业成功，造成前后端版本劈叉；这种情况要么只回滚服务端，要么把这次的 `ci/` 改动 cherry-pick 到回滚分支上再发。
- 服务器上只通过 `ci/deploy-server.sh` 起服务：它先读 `~/.env`（云密钥、static 桶、CCR 登录）再读仓库 `.env`（`RIICHI_IMAGE` / `RIICHI_PORT` / `CORS_ORIGINS`），`--no-build` 只拉镜像。直接 `docker compose up` 会在服务器上本地构建，且缺少密钥时会静默退回本地存储模式。
- 镜像内仍包含同源模式的前端产物（本地与开发机 compose 需要）；线上在服务器 `.env` 里设 `WEB_DIST=`（空）关闭静态托管，接口域名下的页面路径会 302 到正式站点。
- 仓库 secrets：`QCLOUD_SECRET_ID` / `QCLOUD_SECRET_KEY`（COS 上传 + CDN 刷新）、`QCLOUD_DOCKER_USERNAME` / `QCLOUD_DOCKER_PASSWORD`（CCR）、`DEPLOY_SSH_HOST` / `DEPLOY_SSH_KEY` / `DEPLOY_KNOWN_HOSTS`（部署机）。桶名、域名、镜像名等常量写在工作流的 `env` 里。
- 腾讯云 CDN 对约 10 秒无数据的 WebSocket 会静默回收，客户端每 5 秒发心跳、8 秒无回包即重连，接口响应带 `Cache-Control: no-store`；CDN 侧接口域名仍应配置为不缓存。

立直音乐：操作栏「对局中」一节选曲并按「立直」（手机与主控台弹窗都有；主控台代按时浮窗不显示名字），电视循环播放，右下角浮窗显示谁在放哪首，点结算键即停。曲库是 `packages/core/src/music/manifest.json`（`id` = 桶内对象名 uuid，`title` = 展示名，`file` = 本地原文件名），音频固定从 `https://static.bitego.net/riichi/music/<id>.mp3` 播放（常量在 `apps/web/src/features/music/url.ts`），服务端与前端都不需要额外配置。加曲：manifest 追加一条（id 用 `uuidgen | tr A-Z a-z`，必须小写）→ `QCLOUD_SECRET_ID=… QCLOUD_SECRET_KEY=… ci/upload-music.sh <放原文件的目录>`（本机执行，需要 `pipx install coscmd`）→ 推 `main`。

拍照识别：手机结算对话框的「牌面」页有「拍照识别」——打开全屏取景框，把手牌、副露和宝牌指示牌放进中间那条取景带（带外压暗，牌河自然落在暗区），**连续三帧认出同一副牌就自动定格**（约一秒；对不齐时右下角快门随时可按）→ 牌面自动填入并算番。推理在 Web Worker 里跑（onnxruntime-web 单线程 WASM；约 10 MB 模型和 14 MB 运行时在进房间时就后台预下载，之后走缓存，没下完时取景页显示进度），定格帧就是上传留存的那张照片，与检测框严格对齐。识别通过时结算界面只展示一排牌、指示牌与旗标，键盘收起；没把握的牌带记号，点一下可以换牌或改和张；识别不完整才展开全键盘。摆法约定：暗牌连排、**和张横放**接在一端；副露 3/4 张且含一张横置（暗杠 = 牌背-X-X-牌背），放右侧、上方、下方都行；宝牌指示牌放手牌上方且全部正放，两行时上表下里；认出里宝指示牌会自动勾上立直。每次识别的裁剪图与结果会存到对象存储 `hands/` 前缀与 `recognitions` 表，结算确认后把最终手牌一并记录，作为后续训练数据（每人每小时最多 60 次）。标注模式：首页底部「给模型标牌 →」进 `/label`，不进房间也能用——取景框里多画检测框与牌图标签（点框看类别与置信度），右下角多一个相册入口（相册图也走同一条取景带选区）；定格后把认错的改对，按「就是这手」把真值传回去，随即自动回到取景接着拍。这条路的记录以 `source=label` 存，与房间结算来的分开统计。模型训练、导出与发布在 `ml/`（见 `ml/README.md`）；类目录与当前发布的模型记录在 `packages/core/src/recognition/manifest.json`，模型对象放 `https://static.bitego.net/riichi/models/<id>.onnx`（`ci/upload-model.sh` 校验、上传并把 `model` 写回 manifest；为 `null` 时手机上不显示入口）。

头像等用户文件默认落在 `DATA_DIR/objects`，由服务端在 `/api/objects/*` 托管；配置 `QCLOUD_*` 五项变量后改为直传腾讯云 COS（桶内 `riichi/` 前缀，URL 走 CDN 域名），变量清单见 `.env.template`。数据库结构按 `user_version` 自动迁移，升级镜像无需手工处理；从 v1 数据升级时头像字段会被清空（旧的 `DATA_DIR/avatars` 目录不再使用，可手动删除），玩家重新上传即可。

## 结构

- `packages/core` 规则、计分、reducer（纯 TS，前后端共用）
- `apps/server` Hono + WebSocket + SQLite，房间事件溯源，托管前端产物
- `apps/web` Vite + React，`/console` 电视端，`/r/:code` 手机端
- `ml` 牌面检测模型的训练工作台（Python / uv，不参与 yarn 工作区）
