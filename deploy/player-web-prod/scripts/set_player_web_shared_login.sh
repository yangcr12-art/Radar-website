#!/usr/bin/env bash
set -euo pipefail

AUTH_DIR="/etc/player-web"
AUTH_FILE="${AUTH_DIR}/auth.json"
AUTH_USER="${PLAYER_WEB_LOGIN_USERNAME:-player}"
AUTH_PASS="${PLAYER_WEB_LOGIN_PASSWORD:-}"
SESSION_SECRET="${PLAYER_WEB_SESSION_SECRET:-}"
SERVICE_NAME="player-web-backend"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "请使用 sudo 运行本脚本。" >&2
    exit 1
  fi
}

load_existing_secret() {
  if [[ ! -f "$AUTH_FILE" ]]; then
    return 0
  fi
  python3 - "$AUTH_FILE" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
try:
    payload = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    payload = {}
secret = payload.get("sessionSecret")
if isinstance(secret, str) and secret.strip():
    print(secret.strip())
PY
}

write_auth_file() {
  install -d -m 0750 "$AUTH_DIR"
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

if [[ -z "$AUTH_PASS" ]]; then
  read -r -p "请输入共享账号（默认 ${AUTH_USER}）: " INPUT_USER
  AUTH_USER="${INPUT_USER:-$AUTH_USER}"
  read -r -s -p "请输入共享密码: " AUTH_PASS
  echo
  read -r -s -p "请再次输入共享密码: " AUTH_PASS_CONFIRM
  echo
  if [[ -z "$AUTH_PASS" ]]; then
    echo "共享密码不能为空。" >&2
    exit 1
  fi
  if [[ "$AUTH_PASS" != "$AUTH_PASS_CONFIRM" ]]; then
    echo "两次输入的共享密码不一致。" >&2
    exit 1
  fi
fi

if [[ -z "$SESSION_SECRET" ]]; then
  SESSION_SECRET="$(load_existing_secret)"
fi
if [[ -z "$SESSION_SECRET" ]]; then
  SESSION_SECRET="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"
fi

write_auth_file
systemctl restart "$SERVICE_NAME"

echo "[login] 已更新共享登录账号。"
echo "[login] username: $AUTH_USER"
echo "[login] config: $AUTH_FILE"
