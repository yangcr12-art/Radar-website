#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${API_BASE:-http://127.0.0.1:8787}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_LOG_PATH="${BACKEND_LOG_PATH:-$ROOT_DIR/.tmp_player_web_backend.log}"

backend_started_by_script=0
backend_pid=""

cleanup() {
  if [[ "$backend_started_by_script" -eq 1 && -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" || true
  fi
}
trap cleanup EXIT INT TERM

if curl -fsS "$API_BASE/api/health" >/dev/null; then
  echo "[start] backend already healthy at $API_BASE"
else
  echo "[start] backend not reachable, starting player-web/server/app.py"
  (
    cd "$ROOT_DIR/player-web/server"
    python3 app.py
  ) >"$BACKEND_LOG_PATH" 2>&1 &
  backend_pid="$!"
  backend_started_by_script=1

  for _ in $(seq 1 45); do
    if curl -fsS "$API_BASE/api/health" >/dev/null; then
      echo "[start] backend healthy"
      break
    fi
    sleep 1
  done

  if ! curl -fsS "$API_BASE/api/health" >/dev/null; then
    echo "[start] backend failed to become healthy, check log: $BACKEND_LOG_PATH" >&2
    exit 1
  fi
fi

echo "[start] launching frontend at http://$FRONTEND_HOST:$FRONTEND_PORT"
cd "$ROOT_DIR/player-web"
npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
