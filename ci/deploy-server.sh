#!/usr/bin/env bash
# 在服务器上执行：拉取最新仓库、登录镜像仓库、拉取指定 tag 的镜像并重启容器、等待健康检查。
# 用法：bash ci/deploy-server.sh <tag>
# 环境：先读 ~/.env（云密钥、static 桶、镜像仓库登录），再读仓库 .env
#       （RIICHI_IMAGE / RIICHI_PORT / CORS_ORIGINS）。服务器上只允许通过本脚本起服务：
#       直接 `docker compose up` 会在这台 2 GB 机器上本地构建，且缺少密钥时会静默退回本地存储模式。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 干净的工作树才拉；拉到新提交后用新脚本重新执行一次
if [[ -z "${DEPLOY_REEXECED:-}" ]] && git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git -C "$ROOT_DIR" diff --quiet && git -C "$ROOT_DIR" diff --cached --quiet; then
    BEFORE="$(git -C "$ROOT_DIR" rev-parse HEAD)"
    git -C "$ROOT_DIR" pull --ff-only || true
    if [[ "$BEFORE" != "$(git -C "$ROOT_DIR" rev-parse HEAD)" ]]; then
      export DEPLOY_REEXECED=1
      exec bash "$ROOT_DIR/ci/deploy-server.sh" "$@"
    fi
  else
    echo "git working tree is dirty, skip git pull" >&2
  fi
fi

for f in "$HOME/.env" "$ROOT_DIR/.env"; do
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$f"
    set +a
  fi
done

command -v docker >/dev/null 2>&1 || { echo "docker not found" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin not available" >&2; exit 1; }

TAG="${1:-${RIICHI_TAG:-latest}}"
[[ "$TAG" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || { echo "invalid tag: $TAG" >&2; exit 1; }
[[ -n "${RIICHI_IMAGE:-}" ]] || { echo "RIICHI_IMAGE is required (set it in $ROOT_DIR/.env)" >&2; exit 1; }

LOCK_DIR="/tmp/riichi-deploy.lock"
mkdir "$LOCK_DIR" 2>/dev/null || { echo "deploy is already running" >&2; exit 1; }
trap 'rmdir "$LOCK_DIR" >/dev/null 2>&1 || true' EXIT

if [[ -n "${QCLOUD_DOCKER_SERVER:-}" && -n "${QCLOUD_DOCKER_USERNAME:-}" && -n "${QCLOUD_DOCKER_PASSWORD:-}" ]]; then
  echo "$QCLOUD_DOCKER_PASSWORD" | docker login "$QCLOUD_DOCKER_SERVER" -u "$QCLOUD_DOCKER_USERNAME" --password-stdin
fi

export RIICHI_TAG="$TAG"
COMPOSE=(docker compose -f "$ROOT_DIR/docker-compose.yml")
echo "Deploying ${RIICHI_IMAGE}:${RIICHI_TAG}"
"${COMPOSE[@]}" pull riichi
"${COMPOSE[@]}" up -d --no-build riichi

HEALTH_URL="http://127.0.0.1:${RIICHI_PORT:-8787}/health"
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "healthy: $HEALTH_URL"
    exit 0
  fi
  sleep 2
done

echo "health check timeout: $HEALTH_URL" >&2
"${COMPOSE[@]}" ps riichi >&2 || true
"${COMPOSE[@]}" logs --tail=200 riichi >&2 || true
exit 1
