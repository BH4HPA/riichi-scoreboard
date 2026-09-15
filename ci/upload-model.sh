#!/usr/bin/env bash
# 把导出的 ONNX 模型上传到 static 桶：riichi/models/<uuid>.onnx（对象名用新生成的 uuid，不可覆盖旧模型：
# 手机与服务端都按 immutable 缓存）。在本机手工执行（CI 不调用）。
# 用法：ci/upload-model.sh <model.onnx> [note]
# 需要：coscmd 已在 PATH（pipx install coscmd）；QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY 必填，
#       QCLOUD_COS_BUCKET / QCLOUD_COS_REGION 默认为 bite-go 的 static 桶。
# 上传后打印 manifest 片段，粘到 packages/core/src/recognition/manifest.json 的 model 字段并推 main。
# 桶内前缀与下载地址（apps/web / apps/server 的 models 常量）须一致，改一处必须改另一处。
set -euo pipefail

FILE="${1:-}"
NOTE="${2:-}"
KEY_PREFIX="riichi/models"
BUCKET="${QCLOUD_COS_BUCKET:-bitego-static-1251306253}"
REGION="${QCLOUD_COS_REGION:-ap-shanghai}"

[[ -n "$FILE" && -f "$FILE" ]] || { echo "usage: $0 <model.onnx> [note]" >&2; exit 1; }
[[ "$FILE" == *.onnx ]] || { echo "expected an .onnx file" >&2; exit 1; }
[[ -n "${QCLOUD_SECRET_ID:-}" && -n "${QCLOUD_SECRET_KEY:-}" ]] || {
  echo "QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY are required" >&2
  exit 1
}
command -v coscmd >/dev/null 2>&1 || { echo "coscmd not found: pipx install coscmd" >&2; exit 1; }

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

cat <<EOF

manifest.json → "model":
  {
    "id": "$ID",
    "sha256": "$SHA",
    "imgsz": 640,
    "trainedAt": "$(date +%Y-%m-%d)",
    "note": "$NOTE"
  }
EOF
