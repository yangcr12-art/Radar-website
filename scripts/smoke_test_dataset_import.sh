#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8787}"
TMP_XLSX="$(mktemp /tmp/player_import_smoke_XXXXXX.xlsx)"
dataset_id=""

cleanup() {
  rm -f "$TMP_XLSX"
  if [[ -n "$dataset_id" ]]; then
    curl -fsS -X DELETE "$API_BASE/api/player-data/datasets/$dataset_id" >/dev/null || true
  fi
}
trap cleanup EXIT

curl -fsS "$API_BASE/api/health" >/dev/null

python3 - <<'PY' "$TMP_XLSX"
from openpyxl import Workbook
import sys

out = sys.argv[1]
wb = Workbook()
ws = wb.active
ws.append(["player", "Goals", "Assists"])
ws.append(["Smoke A", 12, 3])
ws.append(["Smoke B", 5, 7])
wb.save(out)
print(out)
PY

import_resp="$(curl -fsS -F "file=@$TMP_XLSX" "$API_BASE/api/player-data/import-excel")"
dataset_id="$(python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); print(d.get("datasetId",""))' <<<"$import_resp")"
import_ok="$(python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); print(str(bool(d.get("ok"))).lower())' <<<"$import_resp")"

if [[ -z "$dataset_id" || "$import_ok" != "true" ]]; then
  echo "[smoke] import failed: $import_resp" >&2
  exit 1
fi

datasets_resp="$(curl -fsS "$API_BASE/api/player-data/datasets")"
players_resp="$(curl -fsS "$API_BASE/api/player-data/players?datasetId=$dataset_id")"

python3 - <<'PY' "$dataset_id" "$datasets_resp" "$players_resp"
import json
import sys

dataset_id = sys.argv[1]
datasets_resp = json.loads(sys.argv[2])
players_resp = json.loads(sys.argv[3])

datasets = datasets_resp.get("datasets") or []
if not any(str(item.get("id")) == dataset_id for item in datasets if isinstance(item, dict)):
    raise SystemExit(f"[smoke] dataset not found in list: {dataset_id}")

if not bool(players_resp.get("ok")):
    raise SystemExit("[smoke] players endpoint returned ok=false")

player_count = int(players_resp.get("playerCount") or 0)
if player_count != 2:
    raise SystemExit(f"[smoke] unexpected playerCount={player_count}, expected 2")

print(f"[smoke] passed datasetId={dataset_id}, playerCount={player_count}")
PY
