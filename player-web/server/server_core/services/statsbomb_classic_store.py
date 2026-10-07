from __future__ import annotations

import csv
import io
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock
from typing import Any
from uuid import uuid4

from server_core.services.auth_config import get_primary_login_username
from server_core.services.session_auth import get_authenticated_username
from server_core.services.user_storage import ensure_user_data_dir, user_data_file, user_data_subdir


VERSION = 1
MAX_CSV_BYTES = 10 * 1024 * 1024
MAX_ROWS = 20_000
MAX_COLUMNS = 500
WRITE_LOCK = Lock()
SENSITIVE_COLUMNS = {"Account"}

GROUP_BOUNDARIES = (
    ("profile", "基本信息", "Default Radar Template"),
    ("attacking", "进攻与创造", "Assists"),
    ("defending", "防守", "Aggressive Actions"),
    ("pressing", "压迫", "Average Pressure Distance"),
    ("passing", "传球与推进", "Crossing%"),
    ("goalkeeping", "门将", "Claims - CCAA%"),
    ("obv", "OBV", "Defensive Action OBV"),
    ("three_sixty", "360 派生指标", "Average SRI"),
)


class StatsBombClassicCsvError(ValueError):
    pass


def _username() -> str:
    return get_authenticated_username(get_primary_login_username())


def _dataset_dir() -> Path:
    ensure_user_data_dir(_username())
    return user_data_subdir(_username(), "statsbomb_classic_datasets")


def _index_path() -> Path:
    return user_data_file(_username(), "statsbomb_classic_datasets_index.json")


def _index_backup_path() -> Path:
    return user_data_file(_username(), "statsbomb_classic_datasets_index.json.bak")


def _dataset_path(dataset_id: str) -> Path:
    return _dataset_dir() / f"{dataset_id}.json"


def _valid_dataset_id(dataset_id: str) -> bool:
    return bool(re.fullmatch(r"sbcs_[0-9]{14}_[0-9a-f]{6}", str(dataset_id or "")))


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_index() -> dict[str, Any]:
    return {"version": VERSION, "updatedAt": None, "selectedDatasetId": "", "datasets": []}


def _atomic_write(path: Path, backup_path: Path, prefix: str, doc: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(doc, ensure_ascii=False, indent=2)
    with WRITE_LOCK:
        if path.exists():
            backup_path.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        with NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=path.parent, prefix=prefix, suffix=".tmp") as handle:
            handle.write(content)
            temp_path = Path(handle.name)
        os.replace(temp_path, path)


def _load_index() -> dict[str, Any]:
    path = _index_path()
    if not path.exists():
        return _default_index()
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        return _default_index()
    return {
        "version": int(value.get("version", VERSION)),
        "updatedAt": value.get("updatedAt"),
        "selectedDatasetId": str(value.get("selectedDatasetId") or ""),
        "datasets": value.get("datasets") if isinstance(value.get("datasets"), list) else [],
    }


def _load_dataset(dataset_id: str) -> dict[str, Any] | None:
    path = _dataset_path(dataset_id)
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    return value if isinstance(value, dict) else None


def _write_index(index: dict[str, Any]) -> None:
    _atomic_write(_index_path(), _index_backup_path(), "statsbomb_classic_index_", index)


def _decode_csv(payload: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise StatsBombClassicCsvError("CSV 编码无法识别，请使用 StatsBomb 原始下载文件或 UTF-8 CSV。")


def _number(value: str) -> float | None:
    text = str(value or "").strip().replace(",", "")
    if text.endswith("%"):
        text = text[:-1].strip()
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _group_map(headers: list[str]) -> tuple[dict[str, str], list[dict[str, Any]]]:
    starts: list[tuple[int, str, str]] = []
    for group_id, label, anchor in GROUP_BOUNDARIES:
        if anchor in headers:
            starts.append((headers.index(anchor), group_id, label))
    starts.sort(key=lambda item: item[0])
    mapping: dict[str, str] = {}
    groups: list[dict[str, Any]] = []
    for position, (start_index, group_id, label) in enumerate(starts):
        end_index = starts[position + 1][0] if position + 1 < len(starts) else len(headers)
        keys = headers[start_index:end_index]
        for key in keys:
            mapping[key] = group_id
        groups.append({"id": group_id, "label": label, "columnCount": len(keys)})
    for header in headers:
        mapping.setdefault(header, "profile")
    if not any(group.get("id") == "profile" for group in groups):
        groups.insert(0, {"id": "profile", "label": "基本信息", "columnCount": 0})
    profile = next(group for group in groups if group.get("id") == "profile")
    profile["columnCount"] = sum(1 for header in headers if mapping[header] == "profile")
    return mapping, groups


def parse_classic_player_stats_csv(payload: bytes, filename: str) -> dict[str, Any]:
    if not payload:
        raise StatsBombClassicCsvError("CSV 文件为空。")
    if len(payload) > MAX_CSV_BYTES:
        raise StatsBombClassicCsvError("CSV 文件超过 10 MB 限制。")
    if filename and not filename.lower().endswith(".csv"):
        raise StatsBombClassicCsvError("请选择 StatsBomb Scout 下载的 CSV 文件。")

    text = _decode_csv(payload)
    reader = csv.reader(io.StringIO(text, newline=""))
    try:
        raw_headers = next(reader)
    except StopIteration as exc:
        raise StatsBombClassicCsvError("CSV 文件没有表头。") from exc

    headers = [str(header or "").strip() for header in raw_headers]
    if not headers or any(not header for header in headers):
        raise StatsBombClassicCsvError("CSV 表头包含空字段。")
    if len(headers) > MAX_COLUMNS:
        raise StatsBombClassicCsvError(f"CSV 字段数超过 {MAX_COLUMNS} 列限制。")
    duplicates = sorted({header for header in headers if headers.count(header) > 1})
    if duplicates:
        raise StatsBombClassicCsvError(f"CSV 包含重复字段：{', '.join(duplicates[:5])}")
    if not ({"Name", "Player Name"} & set(headers)) or "Team" not in headers or "Season" not in headers:
        raise StatsBombClassicCsvError("不是可识别的 StatsBomb Scout 球员统计 CSV（需要 Name/Player Name、Team、Season 字段）。")

    visible_headers = [header for header in headers if header not in SENSITIVE_COLUMNS]
    rows: list[dict[str, str]] = []
    for row_number, raw_row in enumerate(reader, start=2):
        if row_number > MAX_ROWS + 1:
            raise StatsBombClassicCsvError(f"CSV 数据超过 {MAX_ROWS} 行限制。")
        if not raw_row or not any(str(value or "").strip() for value in raw_row):
            continue
        if len(raw_row) != len(headers):
            raise StatsBombClassicCsvError(f"CSV 第 {row_number} 行有 {len(raw_row)} 列，表头为 {len(headers)} 列。")
        row = {header: str(raw_row[index] or "").strip() for index, header in enumerate(headers) if header in visible_headers}
        rows.append(row)
    if not rows:
        raise StatsBombClassicCsvError("CSV 中没有球员记录。")

    group_by_column, groups = _group_map(visible_headers)
    columns: list[dict[str, Any]] = []
    for header in visible_headers:
        values = [row.get(header, "") for row in rows if row.get(header, "") != ""]
        numeric_count = sum(1 for value in values if _number(value) is not None)
        kind = "percent" if header.endswith("%") else "number" if values and numeric_count == len(values) else "text"
        columns.append(
            {
                "key": header,
                "label": header,
                "group": group_by_column.get(header, "profile"),
                "kind": kind,
                "nonEmptyCount": len(values),
            }
        )

    def unique_values(*keys: str) -> list[str]:
        values = {row.get(key, "") for row in rows for key in keys if row.get(key, "")}
        return sorted(values, key=str.casefold)

    return {
        "version": VERSION,
        "sourceType": "statsbomb-classic-scout-csv",
        "sourceFile": Path(filename or "player-stats.csv").name,
        "excludedColumns": sorted(SENSITIVE_COLUMNS & set(headers)),
        "rowCount": len(rows),
        "columnCount": len(visible_headers),
        "columns": columns,
        "groups": groups,
        "filters": {
            "competitions": unique_values("Competition", "Competition Name"),
            "seasons": unique_values("Season", "Seasons"),
            "teams": unique_values("Team"),
            "positions": unique_values("Primary Position"),
        },
        "rows": rows,
    }


def save_classic_dataset(payload: bytes, filename: str) -> dict[str, Any]:
    doc = parse_classic_player_stats_csv(payload, filename)
    dataset_id = f"sbcs_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:6]}"
    updated_at = _iso_now()
    doc["datasetId"] = dataset_id
    doc["updatedAt"] = updated_at
    dataset_path = _dataset_path(dataset_id)
    _atomic_write(dataset_path, dataset_path.with_suffix(".bak.json"), f"statsbomb_classic_{dataset_id}_", doc)

    index = _load_index()
    datasets = [item for item in index.get("datasets", []) if isinstance(item, dict)]
    summary = {
        "id": dataset_id,
        "name": f"{doc['sourceFile']} ({updated_at[:19]})",
        "sourceFile": doc["sourceFile"],
        "updatedAt": updated_at,
        "rowCount": doc["rowCount"],
        "columnCount": doc["columnCount"],
        "competitions": doc["filters"]["competitions"],
        "seasons": doc["filters"]["seasons"],
    }
    datasets.insert(0, summary)
    index.update({"updatedAt": updated_at, "selectedDatasetId": dataset_id, "datasets": datasets})
    _write_index(index)
    return {"dataset": summary, "data": doc}


def list_classic_datasets() -> dict[str, Any]:
    index = _load_index()
    return {
        "datasets": index.get("datasets", []),
        "selectedDatasetId": index.get("selectedDatasetId", ""),
        "updatedAt": index.get("updatedAt"),
    }


def get_classic_dataset(requested_dataset_id: str = "") -> tuple[str, dict[str, Any] | None]:
    index = _load_index()
    dataset_id = str(requested_dataset_id or index.get("selectedDatasetId") or "")
    if not dataset_id or not _valid_dataset_id(dataset_id):
        return dataset_id, None
    return dataset_id, _load_dataset(dataset_id)


def delete_classic_dataset(dataset_id: str) -> dict[str, Any] | None:
    if not _valid_dataset_id(dataset_id):
        return None
    index = _load_index()
    datasets = [item for item in index.get("datasets", []) if isinstance(item, dict)]
    if not any(str(item.get("id") or "") == dataset_id for item in datasets):
        return None
    path = _dataset_path(dataset_id)
    if path.exists():
        path.unlink()
    backup_path = path.with_suffix(".bak.json")
    if backup_path.exists():
        backup_path.unlink()
    remaining = [item for item in datasets if str(item.get("id") or "") != dataset_id]
    selected = str(index.get("selectedDatasetId") or "")
    if selected == dataset_id:
        selected = str(remaining[0].get("id") or "") if remaining else ""
    index.update({"updatedAt": _iso_now(), "selectedDatasetId": selected, "datasets": remaining})
    _write_index(index)
    return {"deletedDatasetId": dataset_id, "selectedDatasetId": selected, "datasets": remaining}
