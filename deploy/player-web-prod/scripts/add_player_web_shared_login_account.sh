#!/usr/bin/env bash
set -euo pipefail

AUTH_DIR="/etc/player-web"
AUTH_FILE="${AUTH_DIR}/auth.json"
AUTH_USER="${PLAYER_WEB_LOGIN_USERNAME:-}"
AUTH_PASS="${PLAYER_WEB_LOGIN_PASSWORD:-}"
SERVICE_NAME="player-web-backend"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "请使用 sudo 运行本脚本。" >&2
    exit 1
  fi
}

require_root

if [[ -z "$AUTH_USER" ]]; then
  read -r -p "请输入要追加的账号: " AUTH_USER
fi
if [[ -z "$AUTH_USER" ]]; then
  echo "账号不能为空。" >&2
  exit 1
fi

if [[ -z "$AUTH_PASS" ]]; then
  read -r -s -p "请输入该账号密码: " AUTH_PASS
  echo
  read -r -s -p "请再次输入该账号密码: " AUTH_PASS_CONFIRM
  echo
  if [[ -z "$AUTH_PASS" ]]; then
    echo "密码不能为空。" >&2
    exit 1
  fi
  if [[ "$AUTH_PASS" != "$AUTH_PASS_CONFIRM" ]]; then
    echo "两次输入的密码不一致。" >&2
    exit 1
  fi
fi

install -d -m 0750 "$AUTH_DIR"

python3 - "$AUTH_FILE" "$AUTH_USER" "$AUTH_PASS" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
username = sys.argv[2]
password = sys.argv[3]

payload = {}
if path.exists():
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        payload = {}
if not isinstance(payload, dict):
    payload = {}

accounts = payload.get("accounts")
normalized = []
if isinstance(accounts, list):
    for item in accounts:
        if not isinstance(item, dict):
            continue
        item_username = str(item.get("username", "")).strip()
        item_password = str(item.get("password", ""))
        if item_username and item_password:
            normalized.append({"username": item_username, "password": item_password})

legacy_username = str(payload.get("username", "")).strip()
legacy_password = str(payload.get("password", ""))
if not normalized and legacy_username and legacy_password:
    normalized.append({"username": legacy_username, "password": legacy_password})

updated = False
for item in normalized:
    if item["username"] == username:
        item["password"] = password
        updated = True
        break
if not updated:
    normalized.append({"username": username, "password": password})

payload["accounts"] = normalized
payload.pop("username", None)
payload.pop("password", None)
if not isinstance(payload.get("sessionSecret"), str) or not payload.get("sessionSecret", "").strip():
    payload["sessionSecret"] = "player-web-session-secret-2026"

path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

chown root:root "$AUTH_FILE"
chmod 600 "$AUTH_FILE"
systemctl restart "$SERVICE_NAME"

echo "[login] 已追加共享登录账号。"
echo "[login] username: $AUTH_USER"
echo "[login] config: $AUTH_FILE"
