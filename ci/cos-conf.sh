#!/usr/bin/env bash
# 各 COS 上传脚本共用：写一份临时 coscmd 配置（配置不落在 $HOME 里）。
# 用法：source ci/cos-conf.sh; cos_config "$CONF" "$BUCKET" [endpoint] [region]
# 接入点默认走**全球加速域名**：所有桶都已开启全球加速，跨地域上传（GitHub runner 在境外）比
# cos.<region>.myqcloud.com 快一个量级——14 MB 的 onnxruntime wasm 曾在区域域名上传 8 分钟后
# 报 UserNetworkTooSlow 失败。给了 endpoint 用给的，只给 region 则用区域域名。
# 需要环境变量 QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY。

COS_ACCELERATE_ENDPOINT="cos.accelerate.myqcloud.com"

cos_config() {
  local conf="$1" bucket="$2" endpoint="${3:-}" region="${4:-}"
  [[ -n "${QCLOUD_SECRET_ID:-}" && -n "${QCLOUD_SECRET_KEY:-}" ]] || {
    echo "QCLOUD_SECRET_ID / QCLOUD_SECRET_KEY are required" >&2
    return 1
  }
  local args=(-c "$conf" config -a "$QCLOUD_SECRET_ID" -s "$QCLOUD_SECRET_KEY" -b "$bucket")
  if [[ -n "$endpoint" ]]; then
    args+=(-e "$endpoint")
  elif [[ -n "$region" ]]; then
    args+=(-r "$region")
  else
    args+=(-e "$COS_ACCELERATE_ENDPOINT")
  fi
  coscmd "${args[@]}"
}
