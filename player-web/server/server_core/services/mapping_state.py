from __future__ import annotations

import json
from pathlib import Path
import shutil
from typing import Any

from server_core.services.auth_config import get_login_accounts
from server_core.services.percentile_algorithm import default_percentile_algorithm, normalize_percentile_algorithm
from server_core.services.state_store import WRITE_LOCK, _state_bak_path, atomic_write_json, iso_now, load_state_doc
from server_core.services.user_storage import normalize_username, user_data_file


MAPPING_KEYS = (
    "projectMappingRows",
    "matchProjectMappingRows",
    "nameMappingRows",
    "teamMappingRows",
)
MAPPING_VERSION = 1


def _current_username() -> str:
    from server_core.services.auth_config import get_primary_login_username
    from server_core.services.session_auth import get_authenticated_username

    return normalize_username(get_authenticated_username(get_primary_login_username()))


def _resolved_username(username: str | None = None) -> str:
    return normalize_username(username) if username else _current_username()


def _mapping_path(username: str | None = None) -> Path:
    return user_data_file(_resolved_username(username), "mappings.json")


def _mapping_bak_path(username: str | None = None) -> Path:
    return user_data_file(_resolved_username(username), "mappings.json.bak")


def _normalize_key(text: Any) -> str:
    return str(text or "").strip().lower()


def _normalize_project_mapping_rows(payload: Any) -> list[dict[str, str]]:
    if not isinstance(payload, list):
        return []
    rows: list[dict[str, str]] = []
    visible_builtin_keys: set[str] = set()
    custom_keys: set[str] = set()
    for item in payload:
        if not isinstance(item, dict):
            continue
        en = str(item.get("en") or "").strip()
        key = _normalize_key(en)
        if not en or not key:
            continue
        is_builtin = bool(item.get("isBuiltin"))
        if is_builtin:
            if key in visible_builtin_keys:
                continue
            visible_builtin_keys.add(key)
        else:
            if key in custom_keys:
                continue
            custom_keys.add(key)
        rows.append(
            {
                "en": en,
                "zh": str(item.get("zh") or "").strip(),
                "group": str(item.get("group") or "").strip(),
                "percentileAlgorithm": normalize_percentile_algorithm(
                    item.get("percentileAlgorithm"),
                    default_percentile_algorithm(en),
                ),
                "isBuiltin": is_builtin,
            }
        )
    return rows


def _normalize_match_project_mapping_rows(payload: Any) -> list[dict[str, str]]:
    if not isinstance(payload, list):
        return []
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in payload:
        if not isinstance(item, dict):
            continue
        en = str(item.get("en") or "").strip()
        key = _normalize_key(en)
        if not en or not key or key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "en": en,
                "zh": str(item.get("zh") or "").strip(),
                "group": str(item.get("group") or "").strip(),
            }
        )
    return rows


def _normalize_name_mapping_rows(payload: Any) -> list[dict[str, str]]:
    if not isinstance(payload, list):
        return []
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in payload:
        if not isinstance(item, dict):
            continue
        en = str(item.get("en") or "").strip()
        zh = str(item.get("zh") or "").strip()
        team = str(item.get("team") or "").strip()
        key = _normalize_key(en)
        if not (en or zh or team):
            continue
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        rows.append({"en": en, "zh": zh, "team": team})
    return rows


def _pick_better_team_row(current: dict[str, str], candidate: dict[str, str]) -> dict[str, str]:
    current_logo = str(current.get("logoDataUrl") or "").strip()
    candidate_logo = str(candidate.get("logoDataUrl") or "").strip()
    if candidate_logo and not current_logo:
        return candidate
    if len(candidate_logo) > len(current_logo):
        return candidate
    if not str(current.get("logoFileName") or "").strip() and str(candidate.get("logoFileName") or "").strip():
        return candidate
    return current


def _normalize_team_mapping_rows(payload: Any) -> list[dict[str, str]]:
    if not isinstance(payload, list):
        return []
    mapping_by_key: dict[str, dict[str, str]] = {}
    ordered_keys: list[str] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        en = str(item.get("en") or "").strip()
        zh = str(item.get("zh") or "").strip()
        color = str(item.get("color") or "").strip()
        shape = str(item.get("shape") or "").strip()
        logo_data_url = str(item.get("logoDataUrl") or "").strip()
        logo_file_name = str(item.get("logoFileName") or "").strip()
        if not (en or zh or color or shape or logo_file_name or logo_data_url):
            continue
        key = _normalize_key(en) or _normalize_key(zh)
        if not key:
            continue
        row = {
            "en": en,
            "zh": zh,
            "color": color,
            "shape": shape,
            "logoDataUrl": logo_data_url,
            "logoFileName": logo_file_name,
        }
        if key in mapping_by_key:
            existing = mapping_by_key[key]
            base = _pick_better_team_row(existing, row)
            mapping_by_key[key] = {
                **base,
                "en": str(base.get("en") or existing.get("en") or row.get("en") or "").strip(),
                "zh": str(base.get("zh") or existing.get("zh") or row.get("zh") or "").strip(),
                "color": str(base.get("color") or existing.get("color") or row.get("color") or "").strip(),
                "shape": str(base.get("shape") or existing.get("shape") or row.get("shape") or "").strip(),
            }
            continue
        mapping_by_key[key] = row
        ordered_keys.append(key)
    return [mapping_by_key[key] for key in ordered_keys]


def normalize_mapping_payload(payload: Any) -> dict[str, list[dict[str, Any]]]:
    source = payload if isinstance(payload, dict) else {}
    return {
        "projectMappingRows": _normalize_project_mapping_rows(source.get("projectMappingRows")),
        "matchProjectMappingRows": _normalize_match_project_mapping_rows(source.get("matchProjectMappingRows")),
        "nameMappingRows": _normalize_name_mapping_rows(source.get("nameMappingRows")),
        "teamMappingRows": _normalize_team_mapping_rows(source.get("teamMappingRows")),
    }


def has_any_mapping_rows(payload: Any) -> bool:
    normalized = normalize_mapping_payload(payload)
    return any(normalized[key] for key in MAPPING_KEYS)


def _read_json_doc(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _mapping_payload_from_doc(doc: Any) -> dict[str, list[dict[str, Any]]]:
    if not isinstance(doc, dict):
        return normalize_mapping_payload({})
    data = doc.get("data") if isinstance(doc.get("data"), dict) else doc
    return normalize_mapping_payload(data)


def _build_mapping_doc(payload: Any) -> dict[str, Any]:
    return {
        "version": MAPPING_VERSION,
        "updatedAt": iso_now(),
        "data": normalize_mapping_payload(payload),
    }


def _write_mapping_doc(doc: dict[str, Any], username: str | None = None) -> None:
    mapping_path = _mapping_path(username)
    backup_path = _mapping_bak_path(username)
    atomic_write_json(
        mapping_path,
        backup_path,
        "mappings_",
        doc,
    )
    backup_is_valid = has_any_mapping_rows(_mapping_payload_from_doc(_read_json_doc(backup_path)))
    if not backup_is_valid:
        with WRITE_LOCK:
            backup_is_valid = has_any_mapping_rows(_mapping_payload_from_doc(_read_json_doc(backup_path)))
            if mapping_path.exists() and not backup_is_valid:
                shutil.copy2(mapping_path, backup_path)


def _legacy_mapping_candidates(username: str | None = None) -> list[dict[str, list[dict[str, Any]]]]:
    candidates: list[dict[str, list[dict[str, Any]]]] = []
    current_state = load_state_doc(username)
    current_data = current_state.get("data") if isinstance(current_state, dict) else {}
    current_payload = normalize_mapping_payload(current_data)
    if has_any_mapping_rows(current_payload):
        candidates.append(current_payload)

    state_backup = _read_json_doc(_state_bak_path(username))
    backup_data = state_backup.get("data") if isinstance(state_backup, dict) else {}
    backup_payload = normalize_mapping_payload(backup_data)
    if has_any_mapping_rows(backup_payload):
        candidates.append(backup_payload)
    return candidates


def load_mapping_payload(username: str | None = None) -> dict[str, list[dict[str, Any]]]:
    dedicated_doc = _read_json_doc(_mapping_path(username))
    dedicated_payload = _mapping_payload_from_doc(dedicated_doc)
    if has_any_mapping_rows(dedicated_payload):
        return dedicated_payload

    dedicated_backup = _read_json_doc(_mapping_bak_path(username))
    backup_payload = _mapping_payload_from_doc(dedicated_backup)
    if has_any_mapping_rows(backup_payload):
        _write_mapping_doc(_build_mapping_doc(backup_payload), username)
        return backup_payload

    legacy_candidates = _legacy_mapping_candidates(username)
    if legacy_candidates:
        migrated = legacy_candidates[0]
        _write_mapping_doc(_build_mapping_doc(migrated), username)
        return migrated
    return normalize_mapping_payload({})


def save_mapping_payload(payload: Any, username: str | None = None) -> dict[str, Any]:
    normalized = normalize_mapping_payload(payload)
    existing = load_mapping_payload(username)
    if not has_any_mapping_rows(normalized) and has_any_mapping_rows(existing):
        existing_doc = _read_json_doc(_mapping_path(username))
        return existing_doc if isinstance(existing_doc, dict) else _build_mapping_doc(existing)

    doc = _build_mapping_doc(normalized)
    _write_mapping_doc(doc, username)
    return doc


def recover_mapping_payload_from_backup(username: str | None = None) -> bool:
    current_payload = _mapping_payload_from_doc(_read_json_doc(_mapping_path(username)))
    if has_any_mapping_rows(current_payload):
        return False

    backup_payload = _mapping_payload_from_doc(_read_json_doc(_mapping_bak_path(username)))
    if has_any_mapping_rows(backup_payload):
        _write_mapping_doc(_build_mapping_doc(backup_payload), username)
        return True

    legacy_candidates = _legacy_mapping_candidates(username)
    if not legacy_candidates:
        return False
    _write_mapping_doc(_build_mapping_doc(legacy_candidates[0]), username)
    return True


def recover_all_users_mapping_payloads_from_backup() -> int:
    recovered = 0
    seen: set[str] = set()
    for account in get_login_accounts():
        username = normalize_username(account.get("username", ""))
        if not username or username in seen:
            continue
        seen.add(username)
        if recover_mapping_payload_from_backup(username):
            recovered += 1
    return recovered
