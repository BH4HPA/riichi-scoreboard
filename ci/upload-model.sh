#!/usr/bin/env bash
# 发布牌面检测模型：校验 ONNX → 上传到 static 桶 riichi/models/<uuid>.onnx → 把 model 记录写回
# packages/core/src/recognition/manifest.json（然后提交并推 main 即生效）。在本机手工执行（CI 不调用）。
# 对象名每次都是新 uuid，旧模型不会被覆盖（客户端按 immutable 缓存）；回滚 = manifest 指回旧 id。
# 用法：ci/upload-model.sh <model.onnx> [note]
# 需要：ml/ 的 uv 环境（校验脚本 ml/scripts/check_onnx.py 会检查类顺序与 manifest 一致，不一致不上传）；
#       coscmd 已在 PATH（pipx install coscmd）；QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY 必填，
#       QCLOUD_COS_BUCKET / QCLOUD_COS_REGION 默认为 bite-go 的 static 桶。
# 桶内前缀与下载地址常量 apps/web/src/features/recognition/modelUrl.ts 须一致，改一处必须改另一处。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT_DIR/packages/core/src/recognition/manifest.json"
KEY_PREFIX="riichi/models"
BUCKET="${QCLOUD_COS_BUCKET:-bitego-static-1251306253}"
REGION="${QCLOUD_COS_REGION:-ap-shanghai}"
FILE="${1:-}"
NOTE="${2:-}"

[[ -n "$FILE" && -f "$FILE" && "$FILE" == *.onnx ]] || { echo "usage: $0 <model.onnx> [note]" >&2; exit 1; }
[[ -n "${QCLOUD_SECRET_ID:-}" && -n "${QCLOUD_SECRET_KEY:-}" ]] || {
  echo "QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY are required" >&2
  exit 1
}
command -v coscmd >/dev/null 2>&1 || { echo "coscmd not found: pipx install coscmd" >&2; exit 1; }
command -v uv >/dev/null 2>&1 || { echo "uv not found (needed for ml/scripts/check_onnx.py)" >&2; exit 1; }
FILE="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"

# 门禁：形状与类顺序；顺带拿到 imgsz
CHECK="$(cd "$ROOT_DIR/ml" && uv run scripts/check_onnx.py "$FILE")"
echo "$CHECK"
IMGSZ="$(sed -n 's/^classes ok ([0-9]*), imgsz \([0-9]*\)$/\1/p' <<< "$CHECK")"
[[ -n "$IMGSZ" ]] || { echo "could not read imgsz from check_onnx output" >&2; exit 1; }

ID="$(uuidgen | tr 'A-Z' 'a-z')"
SHA="$(shasum -a 256 "$FILE" | cut -d' ' -f1)"
KEY="$KEY_PREFIX/$ID.onnx"

CONF="$(mktemp)"
trap 'rm -f "$CONF"' EXIT
coscmd -c "$CONF" config -a "$QCLOUD_SECRET_ID" -s "$QCLOUD_SECRET_KEY" -b "$BUCKET" -r "$REGION"
echo "$FILE -> cos://$BUCKET/$KEY"
coscmd -c "$CONF" upload \
  -H '{"Content-Type":"application/octet-stream","Cache-Control":"public, max-age=31536000, immutable"}' \
  "$FILE" "$KEY" </dev/null

python3 - "$MANIFEST" "$ID" "$SHA" "$IMGSZ" "$NOTE" <<'PY'
import datetime, json, sys
path, id_, sha, imgsz, note = sys.argv[1:]
m = json.load(open(path, encoding="utf-8"))
m["model"] = {"id": id_, "sha256": sha, "imgsz": int(imgsz),
              "publishedAt": datetime.date.today().isoformat(), "note": note}
json.dump(m, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open(path, "a", encoding="utf-8").write("\n")
PY
(cd "$ROOT_DIR" && yarn prettier --write "$MANIFEST" >/dev/null)
echo "manifest updated: model.id=$ID — commit packages/core/src/recognition/manifest.json and push main"
