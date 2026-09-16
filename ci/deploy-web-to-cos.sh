#!/usr/bin/env bash
# 把 apps/web/dist 同步到 COS 静态站桶（镜像同步，桶内多余文件会被删除）。
# 需要：QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY / QCLOUD_WEB_COS_BUCKET；接入点默认全球加速域名，
#       用 QCLOUD_WEB_COS_ENDPOINT 或 QCLOUD_WEB_COS_REGION 可覆盖（见 ci/cos-conf.sh）。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/apps/web/dist"
# shellcheck source=ci/cos-conf.sh
source "$ROOT_DIR/ci/cos-conf.sh"

BUCKET="${QCLOUD_WEB_COS_BUCKET:-}"
REGION="${QCLOUD_WEB_COS_REGION:-}"
ENDPOINT="${QCLOUD_WEB_COS_ENDPOINT:-}"

[[ -n "$BUCKET" ]] || { echo "QCLOUD_WEB_COS_BUCKET is required" >&2; exit 1; }
[[ -f "$DIST_DIR/index.html" ]] || {
  echo "web build not found: $DIST_DIR (run: yarn workspace @riichi/web build)" >&2
  exit 1
}

python3 -m pip show coscmd >/dev/null 2>&1 || python3 -m pip install --user --quiet coscmd
export PATH="$HOME/.local/bin:$PATH"
command -v coscmd >/dev/null 2>&1 || { echo "coscmd not found after install" >&2; exit 1; }

# 配置文件放临时目录，不落在 $HOME 里
CONF="$(mktemp)"
trap 'rm -f "$CONF"' EXIT
cos_config "$CONF" "$BUCKET" "$ENDPOINT" "$REGION"

# 三遍都是 -s（内容相同就跳过），顺序决定头部：先传的那遍写什么头，后面的遍就不会再改。
# 1) .wasm 要显式标 application/wasm，否则浏览器不能流式编译、ORT 会回退并再拉一遍整文件；
# 2) assets/ 下的其余文件名里带哈希，可以永久缓存（CDN 默认规则只给 1 小时）；
# 3) 根目录（index.html 等）按默认头传，并删掉桶里多余的对象。
IMMUTABLE='"Cache-Control":"public, max-age=31536000, immutable"'
echo "Syncing $DIST_DIR -> cos://$BUCKET/"
coscmd -c "$CONF" upload -rsf --include "*.wasm" \
  -H "{\"Content-Type\":\"application/wasm\",$IMMUTABLE}" "$DIST_DIR/assets/" /assets/ </dev/null
coscmd -c "$CONF" upload -rsf --ignore "*.wasm" -H "{$IMMUTABLE}" "$DIST_DIR/assets/" /assets/ </dev/null
coscmd -c "$CONF" upload -rsf --delete "$DIST_DIR/" / </dev/null
