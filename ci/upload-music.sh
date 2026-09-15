#!/usr/bin/env bash
# 把 packages/core/src/music/manifest.json 里的曲目上传到 static 桶：<COS_KEY_PREFIX>music/<id>.mp3。
# 用法：ci/upload-music.sh <本地目录>   目录里放 manifest 中 file 字段对应的原文件（中文文件名只在本地，桶内只有 uuid）。
# 需要：QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY / QCLOUD_COS_BUCKET / QCLOUD_COS_REGION（含义同 .env.template），
#       COS_KEY_PREFIX 默认 riichi/。已上传且内容相同的对象会跳过（coscmd -s 按 md5 比对），可重复执行。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT_DIR/packages/core/src/music/manifest.json"
SRC_DIR="${1:-}"

[[ -n "$SRC_DIR" && -d "$SRC_DIR" ]] || {
  echo "usage: $0 <dir-with-source-mp3s>" >&2
  exit 1
}
for key in QCLOUD_SECRET_ID QCLOUD_SECRET_KEY QCLOUD_COS_BUCKET QCLOUD_COS_REGION; do
  [[ -n "${!key:-}" ]] || { echo "$key is required" >&2; exit 1; }
done
PREFIX="${COS_KEY_PREFIX:-riichi/}"
[[ -z "$PREFIX" || "$PREFIX" == */ ]] || PREFIX="$PREFIX/"

# 先核对源文件齐全，再动桶
entries() {
  python3 -c 'import json,sys
for t in json.load(open(sys.argv[1], encoding="utf-8")):
    print(t["id"] + "\t" + t["file"])' "$MANIFEST"
}
missing=0
while IFS=$'\t' read -r id file; do
  [[ -f "$SRC_DIR/$file" ]] || { echo "missing source for $id: $SRC_DIR/$file" >&2; missing=1; }
done < <(entries)
[[ "$missing" == 0 ]] || exit 1

python3 -m pip show coscmd >/dev/null 2>&1 || python3 -m pip install --user --quiet coscmd
export PATH="$HOME/.local/bin:$PATH"
command -v coscmd >/dev/null 2>&1 || { echo "coscmd not found after install" >&2; exit 1; }

CONF="$(mktemp)"
trap 'rm -f "$CONF"' EXIT
coscmd -c "$CONF" config -a "$QCLOUD_SECRET_ID" -s "$QCLOUD_SECRET_KEY" -b "$QCLOUD_COS_BUCKET" -r "$QCLOUD_COS_REGION"

while IFS=$'\t' read -r id file; do
  key="${PREFIX}music/${id}.mp3"
  echo "$file -> cos://$QCLOUD_COS_BUCKET/$key"
  coscmd -c "$CONF" upload -s -H '{"Content-Type":"audio/mpeg"}' "$SRC_DIR/$file" "$key"
done < <(entries)
