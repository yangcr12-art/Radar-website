from __future__ import annotations

from copy import deepcopy
from typing import Any

from server_core.services.auth_config import get_login_accounts
from server_core.services.state_store import VERSION, build_state_doc, load_state_doc, write_state_doc
from server_core.services.user_storage import normalize_username


MAPPING_KEYS = (
    "projectMappingRows",
    "matchProjectMappingRows",
    "nameMappingRows",
    "teamMappingRows",
)


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


def _empty_state_payload() -> dict[str, Any]:
    return {
        "draft": None,
        "presets": [],
        "selectedPresetId": "draft",
        "playerMetricPresets": [],
        "matchMetricPresets": [],
        "selectedMatchMetricPresetByDataset": {},
    }


def _merge_team_mappings(current_rows: list[dict[str, str]], backup_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    merged: dict[str, dict[str, str]] = {}
    order: list[str] = []
    for row in current_rows + backup_rows:
        key = _normalize_key(row.get("en")) or _normalize_key(row.get("zh"))
        if not key:
            continue
        if key in merged:
            merged[key] = _pick_better_team_row(merged[key], row)
            for field in ("en", "zh", "color", "shape"):
                if not str(merged[key].get(field) or "").strip() and str(row.get(field) or "").strip():
                    merged[key][field] = str(row.get(field) or "").strip()
            continue
        merged[key] = deepcopy(row)
        order.append(key)
    return [merged[key] for key in order]


def merge_mapping_payloads(current_payload: Any, backup_payload: Any) -> dict[str, list[dict[str, Any]]]:
    current = normalize_mapping_payload(current_payload)
    backup = normalize_mapping_payload(backup_payload)
    merged = dict(current)
    for key in ("projectMappingRows", "matchProjectMappingRows", "nameMappingRows"):
        if not current[key] and backup[key]:
            merged[key] = backup[key]
    merged["teamMappingRows"] = _merge_team_mappings(current["teamMappingRows"], backup["teamMappingRows"])
    return merged


def load_mapping_payload(username: str | None = None) -> dict[str, list[dict[str, Any]]]:
    doc = load_state_doc(username)
    data = doc.get("data") if isinstance(doc, dict) else {}
    return normalize_mapping_payload(data)


def save_mapping_payload(payload: Any, username: str | None = None) -> dict[str, Any]:
    normalized = normalize_mapping_payload(payload)
    existing_doc = load_state_doc(username)
    if isinstance(existing_doc, dict):
        doc = deepcopy(existing_doc)
        data = doc.get("data")
        if not isinstance(data, dict):
            data = _empty_state_payload()
    else:
        doc = build_state_doc(_empty_state_payload())
        data = doc["data"]

    next_data = dict(data)
    next_data.update(normalized)
    doc["version"] = int(doc.get("version", VERSION))
    doc["data"] = next_data
    write_state_doc(doc, username)
    return doc


def recover_mapping_payload_from_backup(username: str | None = None) -> bool:
    current_doc = load_state_doc(username)
    backup_doc = load_state_doc(username)
    # Temporarily use the on-disk backup document if present by reading it through the existing state helpers.
    # The backup file keeps the same schema as state.json.
    from server_core.services.state_store import _state_bak_path  # local import to avoid widening surface area

    backup_path = _state_bak_path(username)
    if not backup_path.exists():
        return False
    try:
        import json

        backup_doc = json.loads(backup_path.read_text(encoding="utf-8"))
    except Exception:
        return False
    current_data = current_doc.get("data") if isinstance(current_doc, dict) else _empty_state_payload()
    backup_data = backup_doc.get("data") if isinstance(backup_doc, dict) else {}
    merged_mappings = merge_mapping_payloads(current_data, backup_data)
    current_mappings = normalize_mapping_payload(current_data)
    if current_mappings == merged_mappings:
        return False
    next_doc = deepcopy(current_doc) if isinstance(current_doc, dict) else build_state_doc(_empty_state_payload())
    next_data = dict(current_data) if isinstance(current_data, dict) else _empty_state_payload()
    next_data.update(merged_mappings)
    next_doc["data"] = next_data
    write_state_doc(next_doc, username)
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
