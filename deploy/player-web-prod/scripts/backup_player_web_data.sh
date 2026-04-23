#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DATA_DIR="$ROOT_DIR/player-web/server/data"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/player-web}"
STAMP="$(date +%Y%m%d_%H%M%S)"
ARCHIVE_PATH="$BACKUP_DIR/player-web-data_${STAMP}.tar.gz"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "请使用 sudo 运行本脚本。" >&2
    exit 1
  fi
}

require_root

if [[ ! -d "$DATA_DIR" ]]; then
  echo "未找到数据目录：$DATA_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
tar -C "$DATA_DIR/.." -czf "$ARCHIVE_PATH" "$(basename "$DATA_DIR")"
echo "[backup] created: $ARCHIVE_PATH"
