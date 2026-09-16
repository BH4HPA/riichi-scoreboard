#!/usr/bin/env bash
# 发布后校验成品：apps/web/dist 里的每个文件都要能从正式站点取到，大小一致、类型正确。
# 为什么按 dist 全量对，而不是解析 index.html 的引用：运行时才拉的资源（onnxruntime 的 .wasm 由
# ort 的 bundle 在识别时才请求）不在 index.html 里，而它恰恰是最大、最容易传失败的那个。
# 为什么比大小而不只看 200：桶配了 SPA 回退，缺失的对象会回 200 + index.html（几百字节）。
# 为什么不查 Cache-Control：CDN 有自己的缓存规则，会改写源站的头（实测 .svg 被回写成
# max-age=3600，.wasm/.js 透传），这里查到的是 CDN 配置而不是我们传上去的东西；长缓存头由
# ci/deploy-web-to-cos.sh 在上传时写进源站对象。
# 半截部署（index.html 已换新、个别对象没传上去）到这里就失败，而不是等用户点开功能才发现。
# 需要：WEB_URL（正式站点根地址）。用法：bash ci/verify-web-deploy.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/apps/web/dist"
BASE="${WEB_URL:-}"
ATTEMPTS=2      # CDN 刷新有传播窗口，失败的再试一次
RETRY_SLEEP=5

[[ -n "$BASE" ]] || { echo "WEB_URL is required" >&2; exit 1; }
[[ -f "$DIST_DIR/index.html" ]] || { echo "web build not found: $DIST_DIR" >&2; exit 1; }
export BASE="${BASE%/}" ATTEMPTS RETRY_SLEEP

# 单个文件：取响应头（去掉行尾回车）比大小；.wasm 另外比类型（否则浏览器不能流式编译）
check_one() {
  local rel="$1" want_size="$2" headers size ctype
  for ((i = 1; i <= ATTEMPTS; i++)); do
    [[ "$i" == 1 ]] || sleep "$RETRY_SLEEP"
    headers="$(curl -fsSI --max-time 60 "$BASE/$rel" | tr -d '\r')" || continue
    size="$(sed -nE 's/^content-length:[[:space:]]*(.*)$/\1/Ip' <<< "$headers" | tail -1)"
    [[ "$size" == "$want_size" ]] || continue
    if [[ "$rel" == *.wasm ]]; then
      ctype="$(sed -nE 's/^content-type:[[:space:]]*(.*)$/\1/Ip' <<< "$headers" | tail -1)"
      [[ "$ctype" == application/wasm* ]] || continue
    fi
    return 0
  done
  # 变量一律加花括号：紧跟中文时，某些 locale 下 bash 会把多字节字符当成变量名的一部分
  echo "FAIL /${rel}（线上大小 ${size:-取不到}，本地 ${want_size}${ctype:+，类型 ${ctype}}）"
  return 1
}
failed=0
count=0
while IFS= read -r -d '' file; do
  count=$((count + 1))
  check_one "${file#"$DIST_DIR"/}" "$(wc -c < "$file" | tr -d ' ')" || failed=$((failed + 1))
done < <(find "$DIST_DIR" -type f -print0)

echo "checked $count files against $BASE, $failed failed"
[[ "$failed" == 0 ]] || exit 1
