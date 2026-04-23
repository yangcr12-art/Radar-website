#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/player-web/server"
FRONTEND_DIR="$ROOT_DIR/player-web"
VENV_DIR="$BACKEND_DIR/.venv"
SERVICE_NAME="player-web-backend"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "请使用 sudo 运行本脚本。" >&2
    exit 1
  fi
}

wait_for_health() {
  local url="$1"
  for _ in $(seq 1 45); do
    if curl -fsS "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

require_root

if [[ ! -x "$VENV_DIR/bin/pip" ]]; then
  echo "未找到后端虚拟环境：$VENV_DIR，请先运行安装脚本。" >&2
  exit 1
fi

"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"

pushd "$FRONTEND_DIR" >/dev/null
npm install
VITE_STORAGE_API_BASE=/ npm run build
popd >/dev/null

RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_GROUP="$(id -gn "$RUN_USER")"
mkdir -p "$BACKEND_DIR/data"
chown -R "$RUN_USER:$RUN_GROUP" "$BACKEND_DIR/data" "$FRONTEND_DIR/dist"

systemctl restart "$SERVICE_NAME"
nginx -t
systemctl reload nginx

if ! wait_for_health "http://127.0.0.1:8787/api/health"; then
  echo "[update] backend health check failed" >&2
  exit 1
fi

if ! wait_for_health "http://127.0.0.1/api/health"; then
  echo "[update] nginx health check failed" >&2
  exit 1
fi

echo "[update] deployment refreshed successfully"
