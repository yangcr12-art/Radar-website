#!/usr/bin/env bash
set -euo pipefail

echo "[compat] 已切换为站内登录页，共享账号改由后端会话管理。"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/set_player_web_shared_login.sh"
