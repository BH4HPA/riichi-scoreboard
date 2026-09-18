#!/bin/sh
# 以 root 启动只做一件事：把数据卷交给 node 用户（老卷是 root 建的），然后降权运行服务。
set -eu
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/data}"
  chown -R node:node "${DATA_DIR:-/data}"
  exec su-exec node "$@"
fi
exec "$@"
