# 本地开发

## 环境

- Node 24（`.nvmrc`；最低 22.13，服务端用 `node:sqlite`）
- Yarn 4，由 Corepack 管理：首次执行 `corepack enable`

```bash
yarn install
yarn dev            # server :8787 + web :5173（Vite 把 /api 与 /ws 代理到 server）
```

## 常用命令

| 命令                                                 | 作用                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `yarn test`                                          | Vitest 单测（`packages/core`、`apps/server`、`apps/web` 的纯函数） |
| `yarn typecheck` / `yarn lint` / `yarn format:check` | 类型、ESLint、Prettier 门禁                                        |
| `yarn build`                                         | 构建 server（`apps/server/dist`）与 web（`apps/web/dist`）         |
| `yarn e2e`                                           | Playwright 端到端（自动构建 web 并在 :8799 起服务）                |
| `SHOTS_DIR=/tmp/x yarn e2e e2e/shots.spec.ts`        | 导出各页面截图做视觉检查（不设 `SHOTS_DIR` 时跳过）                |
| `docker compose up -d --build`                       | 单容器同源运行（:8787，数据卷 `/data`）                            |

## 手机调试要 HTTPS

扫码和拍照识别都依赖 `getUserMedia`，它只在安全上下文里可用。手机用局域网 IP 通过 HTTP 访问时，浏览器会直接拒绝调用相机（入口会自动隐藏并给出提示）。本机和开发机共用**一张** mkcert 证书，手机只需装一次根证书。

一次性准备：

```bash
brew install mkcert
mkdir -p ci/dev-tls/certs
mkcert -cert-file ci/dev-tls/certs/cert.pem -key-file ci/dev-tls/certs/key.pem \
  localhost 127.0.0.1 ::1 <本机局域网 IP> <开发机 IP>
```

`ci/dev-tls/certs/` 不入库。有证书时 `yarn dev` 自动起 HTTPS，没有就退回 HTTP（CI 和新电脑照样能跑）。

手机上信任根证书（只做一次）：

1. 用 `mkcert -CAROOT` 找到 `rootCA.pem`，AirDrop 到手机；
2. iOS：打开文件后，到 设置 → 通用 → VPN 与设备管理 里安装描述文件；
3. **到 设置 → 通用 → 关于本机 → 证书信任设置，打开这张证书的完全信任**（漏了这一步，页面仍然不算安全上下文）。

开发机（boxdev）上的容器只跑 HTTP，前面加一层 caddy 做 TLS 终结：

```bash
rsync -a ci/dev-tls/certs/ boxdev:~/riichi-scoreboard/ci/dev-tls/certs/
ssh boxdev 'cd riichi-scoreboard && docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build'
# 手机打开 https://<开发机 IP>:8443
```

在开发机上用 curl 验证时要加 `--noproxy "*"`，否则公司代理会把 `curl https://127.0.0.1:8443` 拦成 403。出于同样的原因，`docker-compose.dev.yml` 显式清空了 caddy 容器的代理变量：Docker 会把宿主机的代理变量注入每个容器，而 caddy 回源的目标是服务名 `riichi`，匹配不上 `NO_PROXY` 里的网段。

取景框需要 iOS 16.4 或更新（依赖 `OffscreenCanvas`），更低版本会明确提示，不会黑屏。

## 识别模型

训练、导出与发布在 `ml/`，见 [`ml/README.md`](../ml/README.md)。
