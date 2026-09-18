#!/usr/bin/env bash
# 发布立直音乐曲库到静态桶：<prefix>/music/<id>.mp3 与 <prefix>/music/manifest.json。
# 在本机手工执行（CI 不调用）。用法：ci/upload-music.sh <本地目录> [--manifest-only]
#   目录里放 manifest.json（数组，每项 {id, title, file}：id 小写 uuid v4，file 为本地音频文件名）
#   与它引用的音频文件。曲名与音频都不进仓库；桶内对象只按 uuid 命名，清单只带 id/title。
#   --manifest-only：只重写清单（改曲名、下架曲目），不传音频。
# 需要：coscmd 已在 PATH（pipx install coscmd）；QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY / QCLOUD_COS_BUCKET 必填；
#       接入点默认全球加速域名（见 ci/cos-conf.sh）；COS_KEY_PREFIX 默认 riichi，须与前端 VITE_STATIC_BASE_URL 的路径一致。
# 每次全量覆盖上传（coscmd 的 -s 跳过时会静默返回 254，不用它）；曲库总量几十 MB，可重复执行。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=ci/cos-conf.sh
source "$ROOT_DIR/ci/cos-conf.sh"
SRC_DIR="${1:-}"
MODE="${2:-}"
BUCKET="${QCLOUD_COS_BUCKET:-}"
REGION="${QCLOUD_COS_REGION:-}"
ENDPOINT="${QCLOUD_COS_ENDPOINT:-}"
KEY_PREFIX="${COS_KEY_PREFIX:-riichi}/music"

[[ -n "$SRC_DIR" && -f "$SRC_DIR/manifest.json" ]] || {
  echo "usage: $0 <dir-with-manifest.json-and-mp3s> [--manifest-only]" >&2
  exit 1
}
[[ -n "$BUCKET" ]] || { echo "QCLOUD_COS_BUCKET is required" >&2; exit 1; }
command -v coscmd >/dev/null 2>&1 || { echo "coscmd not found: pipx install coscmd" >&2; exit 1; }

# 校验清单并生成公开版（只带 id/title）；id<TAB>file 列表喂后面的循环
PUBLIC="$(mktemp)"
CONF="$(mktemp)"
trap 'rm -f "$PUBLIC" "$CONF"' EXIT
entries="$(python3 - "$SRC_DIR/manifest.json" "$PUBLIC" <<'PY'
import json, re, sys
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
tracks = json.load(open(sys.argv[1], encoding="utf-8"))
ids = set()
for t in tracks:
    assert UUID.match(t["id"]), f"bad id: {t['id']}"
    assert t["title"].strip() and len(t["title"]) <= 40, f"bad title: {t}"
    assert t["file"].endswith(".mp3"), f"bad file: {t}"
    assert t["id"] not in ids, f"duplicate id: {t['id']}"
    ids.add(t["id"])
json.dump([{"id": t["id"], "title": t["title"].strip()} for t in tracks],
          open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=2)
for t in tracks:
    print(t["id"] + "\t" + t["file"])
PY
)"

if [[ "$MODE" != "--manifest-only" ]]; then
  missing=0
  while IFS=$'\t' read -r id file; do
    [[ -f "$SRC_DIR/$file" ]] || { echo "missing source for $id: $SRC_DIR/$file" >&2; missing=1; }
  done <<< "$entries"
  [[ "$missing" == 0 ]] || exit 1
fi

cos_config "$CONF" "$BUCKET" "$ENDPOINT" "$REGION"

if [[ "$MODE" != "--manifest-only" ]]; then
  while IFS=$'\t' read -r id file; do
    key="$KEY_PREFIX/$id.mp3"
    echo "$file -> cos://$BUCKET/$key"
    # stdin 指到 /dev/null：coscmd 会读 stdin，否则它把循环剩下的行吃掉
    coscmd -c "$CONF" upload -H '{"Content-Type":"audio/mpeg"}' "$SRC_DIR/$file" "$key" </dev/null
  done <<< "$entries"
fi

echo "manifest -> cos://$BUCKET/$KEY_PREFIX/manifest.json"
# 清单会改：不给长缓存；CDN 侧仍按默认 TTL，改完记得刷新该路径
coscmd -c "$CONF" upload -H '{"Content-Type":"application/json","Cache-Control":"public, max-age=300"}' \
  "$PUBLIC" "$KEY_PREFIX/manifest.json" </dev/null
