#!/usr/bin/env bash
# 把 packages/core/src/music/manifest.json 里的曲目上传到 static 桶：riichi/music/<id>.mp3。
# 在本机手工执行（CI 不调用）。用法：ci/upload-music.sh <本地目录>
#   目录里放 manifest 中 file 字段对应的原文件；中文文件名只在本地，桶内只有 uuid。
# 需要：coscmd 已在 PATH（pipx install coscmd）；QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY 必填，
#       QCLOUD_COS_BUCKET 默认为 bite-go 的 static 桶，接入点默认全球加速域名（见 ci/cos-conf.sh）。
# 桶内前缀与前端播放地址（apps/web/src/features/music/url.ts）是同一常量，改一处必须改另一处。
# 每次全量覆盖上传（coscmd 的 -s 跳过时会静默返回 254，不用它）；曲库总量几十 MB，可重复执行。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT_DIR/packages/core/src/music/manifest.json"
# shellcheck source=ci/cos-conf.sh
source "$ROOT_DIR/ci/cos-conf.sh"
KEY_PREFIX="riichi/music"
SRC_DIR="${1:-}"
BUCKET="${QCLOUD_COS_BUCKET:-bitego-static-1251306253}"
REGION="${QCLOUD_COS_REGION:-}"
ENDPOINT="${QCLOUD_COS_ENDPOINT:-}"

[[ -n "$SRC_DIR" && -d "$SRC_DIR" ]] || {
  echo "usage: $0 <dir-with-source-mp3s>" >&2
  exit 1
}
[[ -n "${QCLOUD_SECRET_ID:-}" && -n "${QCLOUD_SECRET_KEY:-}" ]] || {
  echo "QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY are required" >&2
  exit 1
}
command -v coscmd >/dev/null 2>&1 || { echo "coscmd not found: pipx install coscmd" >&2; exit 1; }

# id<TAB>file 列表：先整体取出（受 set -e 保护），再喂两个循环
entries="$(python3 -c 'import json,sys
for t in json.load(open(sys.argv[1], encoding="utf-8")):
    print(t["id"] + "\t" + t["file"])' "$MANIFEST")"

missing=0
while IFS=$'\t' read -r id file; do
  [[ -f "$SRC_DIR/$file" ]] || { echo "missing source for $id: $SRC_DIR/$file" >&2; missing=1; }
done <<< "$entries"
[[ "$missing" == 0 ]] || exit 1

CONF="$(mktemp)"
trap 'rm -f "$CONF"' EXIT
cos_config "$CONF" "$BUCKET" "$ENDPOINT" "$REGION"

while IFS=$'\t' read -r id file; do
  key="$KEY_PREFIX/$id.mp3"
  echo "$file -> cos://$BUCKET/$key"
  # stdin 指到 /dev/null：coscmd 会读 stdin，否则它把循环剩下的行吃掉
  coscmd -c "$CONF" upload -H '{"Content-Type":"audio/mpeg"}' "$SRC_DIR/$file" "$key" </dev/null
done <<< "$entries"
