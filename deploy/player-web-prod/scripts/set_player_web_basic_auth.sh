#!/usr/bin/env bash
set -euo pipefail

AUTH_FILE="/etc/nginx/.htpasswd-player-web"
AUTH_USER="${PLAYER_WEB_BASIC_AUTH_USER:-player}"
AUTH_PASS="${PLAYER_WEB_BASIC_AUTH_PASSWORD:-}"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "请使用 sudo 运行本脚本。" >&2
    exit 1
  fi
}

require_root

if ! command -v htpasswd >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y apache2-utils
fi

if [[ -z "$AUTH_PASS" ]]; then
  read -r -p "请输入访问用户名（默认 ${AUTH_USER}）: " INPUT_USER
  AUTH_USER="${INPUT_USER:-$AUTH_USER}"
  read -r -s -p "请输入访问密码: " AUTH_PASS
  echo
  read -r -s -p "请再次输入访问密码: " AUTH_PASS_CONFIRM
  echo
  if [[ -z "$AUTH_PASS" ]]; then
    echo "访问密码不能为空。" >&2
    exit 1
  fi
  if [[ "$AUTH_PASS" != "$AUTH_PASS_CONFIRM" ]]; then
    echo "两次输入的访问密码不一致。" >&2
    exit 1
  fi
fi

htpasswd -bcB "$AUTH_FILE" "$AUTH_USER" "$AUTH_PASS"
chown root:www-data "$AUTH_FILE"
chmod 640 "$AUTH_FILE"

echo "[auth] 已更新访问账号。"
echo "[auth] username: $AUTH_USER"
echo "[auth] file: $AUTH_FILE"
