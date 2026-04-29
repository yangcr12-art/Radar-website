#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BACKUP_DIR="${PLAYER_WEB_SERVER_BACKUP_DIR:-$HOME/player-web-data-backup}"
PUBLIC_PORT="${PLAYER_WEB_PUBLIC_PORT:-8080}"
DATA_DIR="$ROOT_DIR/player-web/server/data"
USERS_BACKUP_DIR="$BACKUP_DIR/users"

cd "$ROOT_DIR"

mkdir -p "$BACKUP_DIR"
cp -f "$DATA_DIR"/player_dataset.json* "$BACKUP_DIR"/ 2>/dev/null || true
cp -f "$DATA_DIR"/player_datasets_index.json* "$BACKUP_DIR"/ 2>/dev/null || true
cp -f "$DATA_DIR"/state.json* "$BACKUP_DIR"/ 2>/dev/null || true
rm -rf "$USERS_BACKUP_DIR"
if [[ -d "$DATA_DIR/users" ]]; then
  mkdir -p "$BACKUP_DIR"
  cp -R "$DATA_DIR/users" "$USERS_BACKUP_DIR"
fi

git stash push -u -m "server-auto-update-$(date +%F-%H%M%S)" >/dev/null || true
git pull origin main

mkdir -p "$DATA_DIR"
cp -f "$BACKUP_DIR"/player_dataset.json* "$DATA_DIR"/ 2>/dev/null || true
cp -f "$BACKUP_DIR"/player_datasets_index.json* "$DATA_DIR"/ 2>/dev/null || true
cp -f "$BACKUP_DIR"/state.json* "$DATA_DIR"/ 2>/dev/null || true
if [[ -d "$USERS_BACKUP_DIR" ]]; then
  rm -rf "$DATA_DIR/users"
  mkdir -p "$DATA_DIR/users"
  cp -R "$USERS_BACKUP_DIR"/. "$DATA_DIR/users"/
fi

sudo env PLAYER_WEB_PUBLIC_PORT="$PUBLIC_PORT" bash deploy/player-web-prod/scripts/update_player_web_prod.sh

echo
git log --oneline -1
curl -s "http://127.0.0.1:8787/api/health"
curl -s "http://127.0.0.1:${PUBLIC_PORT}/api/health"
