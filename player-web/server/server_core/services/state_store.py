from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock
from typing import Any
from uuid import uuid4

from server_core.services.auth_config import get_primary_login_username
from server_core.services.session_auth import get_authenticated_username
from server_core.services.user_storage import ensure_data_dir, user_data_file


VERSION = 1
WRITE_LOCK = Lock()


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _resolve_username(username: str | None = None) -> str:
    if username:
        return username
    return get_authenticated_username(get_primary_login_username())


def _state_path(username: str | None = None) -> Path:
    return user_data_file(_resolve_username(username), "state.json")


def _state_bak_path(username: str | None = None) -> Path:
    return user_data_file(_resolve_username(username), "state.json.bak")


def atomic_write_json(path: Path, bak_path: Path, prefix: str, doc: dict[str, Any]) -> None:
    ensure_data_dir()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(doc, ensure_ascii=False, indent=2)
    with WRITE_LOCK:
        if path.exists():
            bak_path.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        with NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=path.parent, prefix=prefix, suffix=".tmp") as tf:
            tf.write(data)
            tmp_path = Path(tf.name)
        os.replace(tmp_path, path)


def load_state_doc(username: str | None = None) -> dict[str, Any] | None:
    state_path = _state_path(username)
    if not state_path.exists():
        return None
    with state_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def validate_state_payload(payload: Any) -> tuple[bool, str]:
    if not isinstance(payload, dict):
        return False, "payload must be object"
    for key in ("draft", "presets", "selectedPresetId"):
        if key not in payload:
            return False, f"missing key: {key}"
    if not isinstance(payload["presets"], list):
        return False, "presets must be array"
    if not isinstance(payload["selectedPresetId"], str):
        return False, "selectedPresetId must be string"
    player_metric_presets = payload.get("playerMetricPresets")
    legacy_player_metric_presets = payload.get("playerMetricPresetsByDataset")
    match_metric_presets = payload.get("matchMetricPresets")
    selected_match_metric_preset_by_dataset = payload.get("selectedMatchMetricPresetByDataset")
    if player_metric_presets is not None and not isinstance(player_metric_presets, list):
        return False, "playerMetricPresets must be array"
    if legacy_player_metric_presets is not None and not isinstance(legacy_player_metric_presets, dict):
        return False, "playerMetricPresetsByDataset must be object"
    if match_metric_presets is not None and not isinstance(match_metric_presets, list):
        return False, "matchMetricPresets must be array"
    if selected_match_metric_preset_by_dataset is not None and not isinstance(selected_match_metric_preset_by_dataset, dict):
        return False, "selectedMatchMetricPresetByDataset must be object"
    return True, ""


def normalize_metric_preset(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    preset_id = str(item.get("id") or "").strip()
    name = str(item.get("name") or "").strip()
    columns_raw = item.get("columns")
    if not preset_id or not name or not isinstance(columns_raw, list):
        return None
    columns = [str(col).strip() for col in columns_raw if str(col).strip()]
    if not columns:
        return None
    return {
        "id": preset_id,
        "name": name,
        "columns": columns,
        "createdAt": str(item.get("createdAt") or ""),
        "updatedAt": str(item.get("updatedAt") or ""),
    }


def normalize_metric_presets(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        seen_ids: set[str] = set()
        normalized: list[dict[str, Any]] = []
        for item in payload:
            preset = normalize_metric_preset(item)
            if preset is None:
                continue
            preset_id = preset["id"]
            while preset_id in seen_ids:
                preset_id = f"{preset['id']}_{uuid4().hex[:6]}"
            seen_ids.add(preset_id)
            if preset_id != preset["id"]:
                preset = {**preset, "id": preset_id}
            normalized.append(preset)
        normalized.sort(key=lambda item: str(item.get("updatedAt") or ""), reverse=True)
        return normalized

    if not isinstance(payload, dict):
        return []

    seen_ids: set[str] = set()
    normalized = []
    for items in payload.values():
        if not isinstance(items, list):
            continue
        for item in items:
            preset = normalize_metric_preset(item)
            if preset is None:
                continue
            preset_id = preset["id"]
            while preset_id in seen_ids:
                preset_id = f"{preset['id']}_{uuid4().hex[:6]}"
            seen_ids.add(preset_id)
            if preset_id != preset["id"]:
                preset = {**preset, "id": preset_id}
            normalized.append(preset)
    normalized.sort(key=lambda item: str(item.get("updatedAt") or ""), reverse=True)
    return normalized


def normalize_selection_map(payload: Any) -> dict[str, str]:
    if not isinstance(payload, dict):
        return {}
    normalized: dict[str, str] = {}
    for dataset_id, preset_id in payload.items():
        key = str(dataset_id or "").strip()
        value = str(preset_id or "").strip()
        if key and value:
            normalized[key] = value
    return normalized


def normalize_state_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)
    normalized["playerMetricPresets"] = normalize_metric_presets(
        payload.get("playerMetricPresets", payload.get("playerMetricPresetsByDataset"))
    )
    normalized["matchMetricPresets"] = normalize_metric_presets(payload.get("matchMetricPresets"))
    normalized["selectedMatchMetricPresetByDataset"] = normalize_selection_map(payload.get("selectedMatchMetricPresetByDataset"))
    normalized.pop("playerMetricPresetsByDataset", None)
    return normalized


def build_state_doc(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "version": VERSION,
        "updatedAt": iso_now(),
        "data": payload,
    }


def write_state_doc(doc: dict[str, Any], username: str | None = None) -> None:
    atomic_write_json(_state_path(username), _state_bak_path(username), "state_", doc)
