#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/player-web/server"
FRONTEND_DIR="$ROOT_DIR/player-web"
VENV_DIR="$BACKEND_DIR/.venv"
SERVICE_NAME="player-web-backend"
SYSTEMD_TARGET="/etc/systemd/system/${SERVICE_NAME}.service"
SITE_NAME="player-web"
SITE_ROOT="/var/www/player-web"
NGINX_AVAILABLE="/etc/nginx/sites-available/${SITE_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"
AUTH_DIR="/etc/player-web"
AUTH_FILE="${AUTH_DIR}/auth.json"
AUTH_USER="${PLAYER_WEB_LOGIN_USERNAME:-player}"
AUTH_PASS="${PLAYER_WEB_LOGIN_PASSWORD:-}"
SESSION_SECRET="${PLAYER_WEB_SESSION_SECRET:-}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

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

write_auth_file_if_missing() {
  if [[ -f "$AUTH_FILE" ]]; then
    chown root:root "$AUTH_FILE"
    chmod 600 "$AUTH_FILE"
    return 0
  fi

  install -d -m 0750 "$AUTH_DIR"

  if [[ -z "$AUTH_PASS" ]]; then
    AUTH_PASS="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20)"
    echo "[update] generated initial shared login password for user '$AUTH_USER'"
    echo "[update] password: $AUTH_PASS"
  fi

  if [[ -z "$SESSION_SECRET" ]]; then
    SESSION_SECRET="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"
  fi

  python3 - "$AUTH_FILE" "$AUTH_USER" "$AUTH_PASS" "$SESSION_SECRET" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = {
    "username": sys.argv[2],
    "password": sys.argv[3],
    "sessionSecret": sys.argv[4],
}
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

  chown root:root "$AUTH_FILE"
  chmod 600 "$AUTH_FILE"
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

install -d -m 0755 "$SITE_ROOT"
rm -rf "${SITE_ROOT:?}/"*
cp -R "$FRONTEND_DIR/dist/." "$SITE_ROOT/"
RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_GROUP="$(id -gn "$RUN_USER")"
mkdir -p "$BACKEND_DIR/data"
chown -R "$RUN_USER:$RUN_GROUP" "$BACKEND_DIR/data" "$FRONTEND_DIR/dist" "$SITE_ROOT"

sed \
  -e "s|__ROOT_DIR__|$ROOT_DIR|g" \
  -e "s|__RUN_USER__|$RUN_USER|g" \
  -e "s|__RUN_GROUP__|$RUN_GROUP|g" \
  "$ROOT_DIR/deploy/player-web-prod/player-web-backend.service.template" >"$TMP_DIR/${SERVICE_NAME}.service"

install -m 0644 "$TMP_DIR/${SERVICE_NAME}.service" "$SYSTEMD_TARGET"

install -m 0644 "$ROOT_DIR/deploy/player-web-prod/nginx.player-web.conf.template" "$NGINX_AVAILABLE"
ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"
rm -f /etc/nginx/sites-enabled/default

write_auth_file_if_missing

systemctl daemon-reload
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
echo "[update] shared login config: $AUTH_FILE"
