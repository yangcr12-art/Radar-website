#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/player-web/server"
FRONTEND_DIR="$ROOT_DIR/player-web"
VENV_DIR="$BACKEND_DIR/.venv"
SERVICE_NAME="player-web-backend"
AUTH_FILE="/etc/nginx/.htpasswd-player-web"
AUTH_USER="${PLAYER_WEB_BASIC_AUTH_USER:-player}"
AUTH_PASS="${PLAYER_WEB_BASIC_AUTH_PASSWORD:-}"

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

ensure_auth_file() {
  if ! command -v htpasswd >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y apache2-utils
  fi

  if [[ -f "$AUTH_FILE" ]]; then
    chown root:www-data "$AUTH_FILE"
    chmod 640 "$AUTH_FILE"
    return 0
  fi

  if [[ -z "$AUTH_PASS" ]]; then
    AUTH_PASS="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20)"
    echo "[update] generated initial web password for user '$AUTH_USER'"
    echo "[update] password: $AUTH_PASS"
  fi

  htpasswd -bcB "$AUTH_FILE" "$AUTH_USER" "$AUTH_PASS"
  chown root:www-data "$AUTH_FILE"
  chmod 640 "$AUTH_FILE"
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

ensure_auth_file

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
echo "[update] web auth file: $AUTH_FILE"
