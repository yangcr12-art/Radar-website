#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BACKUP_DIR="${PLAYER_WEB_SERVER_BACKUP_DIR:-$HOME/player-web-data-backup}"
PUBLIC_PORT="${PLAYER_WEB_PUBLIC_PORT:-8080}"

cd "$ROOT_DIR"

mkdir -p "$BACKUP_DIR"
cp -f player-web/server/data/player_dataset.json* "$BACKUP_DIR"/ 2>/dev/null || true
cp -f player-web/server/data/player_datasets_index.json* "$BACKUP_DIR"/ 2>/dev/null || true
cp -f player-web/server/data/state.json* "$BACKUP_DIR"/ 2>/dev/null || true

git stash push -u -m "server-auto-update-$(date +%F-%H%M%S)" >/dev/null || true
git pull origin main

cp -f "$BACKUP_DIR"/player_dataset.json* player-web/server/data/ 2>/dev/null || true
cp -f "$BACKUP_DIR"/player_datasets_index.json* player-web/server/data/ 2>/dev/null || true
cp -f "$BACKUP_DIR"/state.json* player-web/server/data/ 2>/dev/null || true

sudo env PLAYER_WEB_PUBLIC_PORT="$PUBLIC_PORT" bash deploy/player-web-prod/scripts/update_player_web_prod.sh

echo
git log --oneline -1
curl -s "http://127.0.0.1:8787/api/health"
curl -s "http://127.0.0.1:${PUBLIC_PORT}/api/health"
