#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_GROUP="$(id -gn "$RUN_USER")"
SERVICE_NAME="player-web-backend"
SITE_NAME="player-web"
SYSTEMD_TARGET="/etc/systemd/system/${SERVICE_NAME}.service"
NGINX_AVAILABLE="/etc/nginx/sites-available/${SITE_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"
BACKEND_DIR="$ROOT_DIR/player-web/server"
FRONTEND_DIR="$ROOT_DIR/player-web"
VENV_DIR="$BACKEND_DIR/.venv"
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

require_root

echo "[install] repo root: $ROOT_DIR"
echo "[install] run user: $RUN_USER"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y python3-venv python3-pip nodejs npm nginx curl ufw

python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"

pushd "$FRONTEND_DIR" >/dev/null
npm install
VITE_STORAGE_API_BASE=/ npm run build
popd >/dev/null

mkdir -p "$BACKEND_DIR/data"
chown -R "$RUN_USER:$RUN_GROUP" "$BACKEND_DIR/data" "$VENV_DIR" "$FRONTEND_DIR/dist"

sed \
  -e "s|__ROOT_DIR__|$ROOT_DIR|g" \
  -e "s|__RUN_USER__|$RUN_USER|g" \
  -e "s|__RUN_GROUP__|$RUN_GROUP|g" \
  "$ROOT_DIR/deploy/player-web-prod/player-web-backend.service.template" >"$TMP_DIR/${SERVICE_NAME}.service"

install -m 0644 "$TMP_DIR/${SERVICE_NAME}.service" "$SYSTEMD_TARGET"

sed \
  -e "s|__ROOT_DIR__|$ROOT_DIR|g" \
  "$ROOT_DIR/deploy/player-web-prod/nginx.player-web.conf.template" >"$TMP_DIR/${SITE_NAME}"

install -m 0644 "$TMP_DIR/${SITE_NAME}" "$NGINX_AVAILABLE"
ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

nginx -t
systemctl enable nginx
systemctl restart nginx

ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
ufw --force enable || true

if ! wait_for_health "http://127.0.0.1:8787/api/health"; then
  echo "[install] backend health check failed: http://127.0.0.1:8787/api/health" >&2
  exit 1
fi

if ! wait_for_health "http://127.0.0.1/api/health"; then
  echo "[install] nginx health check failed: http://127.0.0.1/api/health" >&2
  exit 1
fi

echo "[install] backend healthy at http://127.0.0.1:8787/api/health"
echo "[install] site healthy at http://127.0.0.1/api/health"
echo "[install] public entry: http://$(hostname -I | awk '{print $1}')/"
