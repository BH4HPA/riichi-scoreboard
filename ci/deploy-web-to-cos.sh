#!/usr/bin/env bash
# 把 apps/web/dist 同步到 COS 静态站桶（镜像同步，桶内多余文件会被删除）。
# 需要：QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY / QCLOUD_WEB_COS_BUCKET，以及
#       QCLOUD_WEB_COS_REGION 或 QCLOUD_WEB_COS_ENDPOINT 二选一。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/apps/web/dist"

BUCKET="${QCLOUD_WEB_COS_BUCKET:-}"
REGION="${QCLOUD_WEB_COS_REGION:-}"
ENDPOINT="${QCLOUD_WEB_COS_ENDPOINT:-}"
SECRET_ID="${QCLOUD_SECRET_ID:-}"
SECRET_KEY="${QCLOUD_SECRET_KEY:-}"

[[ -n "$BUCKET" ]] || { echo "QCLOUD_WEB_COS_BUCKET is required" >&2; exit 1; }
[[ -n "$REGION" || -n "$ENDPOINT" ]] || {
  echo "QCLOUD_WEB_COS_REGION (or QCLOUD_WEB_COS_ENDPOINT) is required" >&2
  exit 1
}
[[ -n "$SECRET_ID" && -n "$SECRET_KEY" ]] || {
  echo "QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY are required" >&2
  exit 1
}
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
CONFIG_ARGS=(-c "$CONF" config -a "$SECRET_ID" -s "$SECRET_KEY" -b "$BUCKET")
if [[ -n "$ENDPOINT" ]]; then
  CONFIG_ARGS+=(-e "$ENDPOINT")
else
  CONFIG_ARGS+=(-r "$REGION")
fi
coscmd "${CONFIG_ARGS[@]}"

echo "Syncing $DIST_DIR -> cos://$BUCKET/"
coscmd -c "$CONF" upload -rs --delete -f "$DIST_DIR/" /
