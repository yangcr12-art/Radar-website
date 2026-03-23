from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock
from typing import Any
from uuid import uuid4

from flask import Blueprint, jsonify, request

try:
    import fitz  # type: ignore
except Exception:
    fitz = None  # type: ignore


VERSION = 1
WRITE_LOCK = Lock()
APP_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = APP_DIR / "data"
OPTA_DATASETS_DIR = DATA_DIR / "opta_datasets"
OPTA_DATA_INDEX_PATH = DATA_DIR / "opta_datasets_index.json"
OPTA_DATA_INDEX_BAK_PATH = DATA_DIR / "opta_datasets_index.json.bak"

opta_data_bp = Blueprint("opta_data_api", __name__)

OPTA_ATTACK_COLUMNS = [
    "#",
    "球员",
    "出场",
    "触球",
    "传球",
    "传球%",
    "前传",
    "前传%",
    "失球权",
    "运传中",
    "运中成",
    "传入攻三",
    "关键传",
    "射门",
    "射正",
    "进球",
]

OPTA_DEFENSE_COLUMNS = [
    "#",
    "球员",
    "出场",
    "获球权",
    "尝试抢",
    "抢断",
    "抢断%",
    "空争",
    "空争成",
    "空争%",
    "地争",
    "地争成",
    "地争%",
    "争抢",
    "争抢成",
    "争抢%",
]


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OPTA_DATASETS_DIR.mkdir(parents=True, exist_ok=True)


def _normalize_side(value: Any) -> str:
    token = str(value or "").strip().lower()
    return "away" if token == "away" else "home"


def _default_index() -> dict[str, Any]:
    return {
        "version": VERSION,
        "updatedAt": None,
        "selectedDatasetId": "",
        "datasets": [],
    }


def _dataset_file_path(dataset_id: str) -> Path:
    return OPTA_DATASETS_DIR / f"{dataset_id}.json"


def _atomic_write_json(path: Path, bak_path: Path, prefix: str, doc: dict[str, Any]) -> None:
    _ensure_data_dir()
    data = json.dumps(doc, ensure_ascii=False, indent=2)
    with WRITE_LOCK:
        if path.exists():
            bak_path.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        with NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=path.parent, prefix=prefix, suffix=".tmp") as tf:
            tf.write(data)
            tmp_path = Path(tf.name)
        os.replace(tmp_path, path)


def _load_index() -> dict[str, Any]:
    if OPTA_DATA_INDEX_PATH.exists():
        with OPTA_DATA_INDEX_PATH.open("r", encoding="utf-8") as f:
            idx = json.load(f)
            if isinstance(idx, dict):
                return {
                    "version": int(idx.get("version", VERSION)),
                    "updatedAt": idx.get("updatedAt"),
                    "selectedDatasetId": str(idx.get("selectedDatasetId") or ""),
                    "datasets": idx.get("datasets") if isinstance(idx.get("datasets"), list) else [],
                }
    return _default_index()


def _load_dataset_doc(dataset_id: str) -> dict[str, Any] | None:
    path = _dataset_file_path(dataset_id)
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_dataset_doc(dataset_id: str, doc: dict[str, Any]) -> None:
    path = _dataset_file_path(dataset_id)
    bak_path = OPTA_DATASETS_DIR / f"{dataset_id}.bak.json"
    _atomic_write_json(path, bak_path, f"opta_dataset_{dataset_id}_", doc)


def _write_index(doc: dict[str, Any]) -> None:
    _atomic_write_json(OPTA_DATA_INDEX_PATH, OPTA_DATA_INDEX_BAK_PATH, "opta_datasets_index_", doc)


def _resolve_dataset(index: dict[str, Any], requested_dataset_id: str) -> tuple[str, dict[str, Any] | None]:
    dataset_id = requested_dataset_id or str(index.get("selectedDatasetId") or "")
    if not dataset_id:
        return "", None
    return dataset_id, _load_dataset_doc(dataset_id)


def _normalize_lines(text: str) -> list[str]:
    return [line.strip() for line in str(text or "").splitlines() if str(line or "").strip()]


def _extract_title_team_name(title: str) -> str:
    parts = str(title or "").split("-", 1)
    if len(parts) < 2:
        return ""
    return parts[1].strip()


def _extract_table_and_footnote(block_lines: list[str]) -> tuple[list[str], str]:
    footnote_idx = -1
    for idx, line in enumerate(block_lines):
        if line.startswith("出场 - "):
            footnote_idx = idx
            break
    if footnote_idx < 0:
        return block_lines, ""
    table_lines = block_lines[:footnote_idx]
    footnote = "\n".join(block_lines[footnote_idx:]).strip()
    return table_lines, footnote


def _make_row_id(player_name: str, used_ids: dict[str, int], fallback: str) -> str:
    base = "".join(ch.lower() if ch.isalnum() else "_" for ch in str(player_name or "")).strip("_")
    if not base:
        base = fallback
    if base not in used_ids:
        used_ids[base] = 1
        return base
    used_ids[base] += 1
    return f"{base}_{used_ids[base]}"


def _parse_table_rows(lines: list[str], columns: list[str]) -> list[dict[str, Any]]:
    stat_count = len(columns) - 2
    used_ids: dict[str, int] = {}
    out: list[dict[str, Any]] = []
    idx = 0
    while idx < len(lines):
        token = str(lines[idx]).strip()
        if re.fullmatch(r"\d+", token):
            player_idx = idx + 1
            stats_start = idx + 2
            stats_end = stats_start + stat_count
            if player_idx < len(lines) and stats_end <= len(lines):
                player_name = str(lines[player_idx]).strip()
                stats = [str(item).strip() for item in lines[stats_start:stats_end]]
                if player_name and len(stats) == stat_count:
                    raw = {columns[0]: token, columns[1]: player_name}
                    for col_idx in range(2, len(columns)):
                        raw[columns[col_idx]] = stats[col_idx - 2]
                    out.append(
                        {
                            "id": _make_row_id(player_name, used_ids, "player"),
                            "player": player_name,
                            "raw": raw,
                        }
                    )
                    idx = stats_end
                    continue
        idx += 1
    return out


def _parse_opta_page(text: str) -> tuple[dict[str, Any] | None, str]:
    lines = _normalize_lines(text)
    attack_idx = -1
    defense_idx = -1
    for idx, line in enumerate(lines):
        if attack_idx < 0 and line.startswith("进攻概况 - "):
            attack_idx = idx
            continue
        if line.startswith("防守概况 - "):
            defense_idx = idx
            break

    if attack_idx < 0 or defense_idx < 0 or defense_idx <= attack_idx:
        return (None, "PDF 页面未识别到“进攻概况/防守概况”结构")

    attack_title = lines[attack_idx]
    defense_title = lines[defense_idx]
    team_name = _extract_title_team_name(attack_title) or _extract_title_team_name(defense_title)

    attack_block = lines[attack_idx + 1 : defense_idx]
    defense_block = lines[defense_idx + 1 :]
    attack_lines, attack_footnote = _extract_table_and_footnote(attack_block)
    defense_lines, defense_footnote = _extract_table_and_footnote(defense_block)

    attack_rows = _parse_table_rows(attack_lines, OPTA_ATTACK_COLUMNS)
    defense_rows = _parse_table_rows(defense_lines, OPTA_DEFENSE_COLUMNS)

    if len(attack_rows) == 0:
        return (None, "进攻概况表格解析失败：未识别到有效球员行")
    if len(defense_rows) == 0:
        return (None, "防守概况表格解析失败：未识别到有效球员行")

    return (
        {
            "teamName": team_name,
            "attackTable": {
                "title": attack_title,
                "columns": OPTA_ATTACK_COLUMNS,
                "rows": attack_rows,
                "footnote": attack_footnote,
            },
            "defenseTable": {
                "title": defense_title,
                "columns": OPTA_DEFENSE_COLUMNS,
                "rows": defense_rows,
                "footnote": defense_footnote,
            },
        },
        "",
    )


@opta_data_bp.route("/api/opta-data/import-pdf", methods=["POST"])
def import_opta_pdf():
    if fitz is None:
        return jsonify({"ok": False, "error": "PyMuPDF 未安装，请先安装 pymupdf"}), 500

    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"ok": False, "error": "missing file"}), 400
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"ok": False, "error": "only .pdf is supported"}), 400

    side = _normalize_side(request.form.get("side"))
    page_idx = 4 if side == "home" else 5

    data = file.read()
    if not data:
        return jsonify({"ok": False, "error": "empty file"}), 400

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        return jsonify({"ok": False, "error": f"invalid pdf file: {exc}"}), 400

    if doc.page_count <= page_idx:
        doc.close()
        return jsonify({"ok": False, "error": "pdf 页数不足：需要至少 6 页（主队第5页/客队第6页）"}), 400

    page_number_used = page_idx + 1
    page_text = doc[page_idx].get_text("text")
    doc.close()

    parsed, parse_err = _parse_opta_page(page_text)
    if parsed is None:
        return jsonify({"ok": False, "error": parse_err}), 400

    updated_at = _iso_now()
    dataset_id = f"ods_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:6]}"
    team_name = str(parsed.get("teamName") or "").strip()
    attack_table = parsed.get("attackTable") or {}
    defense_table = parsed.get("defenseTable") or {}
    attack_rows = attack_table.get("rows") if isinstance(attack_table.get("rows"), list) else []
    defense_rows = defense_table.get("rows") if isinstance(defense_table.get("rows"), list) else []

    doc_to_save = {
        "version": VERSION,
        "datasetId": dataset_id,
        "updatedAt": updated_at,
        "source": {
            "filename": file.filename,
            "sideRequested": side,
            "pageNumberUsed": page_number_used,
            "teamName": team_name,
        },
        "attackTable": attack_table,
        "defenseTable": defense_table,
    }

    try:
        _write_dataset_doc(dataset_id, doc_to_save)
        index = _load_index()
        datasets = [d for d in index.get("datasets", []) if isinstance(d, dict)]
        datasets.insert(
            0,
            {
                "id": dataset_id,
                "name": f"{file.filename} ({updated_at[:19]})",
                "updatedAt": updated_at,
                "sourceFile": file.filename,
                "teamName": team_name,
                "sideRequested": side,
                "pageNumberUsed": page_number_used,
                "attackRowCount": len(attack_rows),
                "defenseRowCount": len(defense_rows),
            },
        )
        index["datasets"] = datasets
        index["selectedDatasetId"] = dataset_id
        index["updatedAt"] = updated_at
        _write_index(index)
    except Exception as exc:
        return jsonify({"ok": False, "error": f"write failed: {exc}"}), 500

    return jsonify(
        {
            "ok": True,
            "datasetId": dataset_id,
            "updatedAt": updated_at,
            "teamName": team_name,
            "sideRequested": side,
            "pageNumberUsed": page_number_used,
            "attackRowCount": len(attack_rows),
            "defenseRowCount": len(defense_rows),
        }
    )


@opta_data_bp.route("/api/opta-data/datasets", methods=["GET"])
def get_opta_datasets():
    try:
        index = _load_index()
        return jsonify(
            {
                "ok": True,
                "datasets": index.get("datasets", []),
                "selectedDatasetId": index.get("selectedDatasetId", ""),
                "updatedAt": index.get("updatedAt"),
            }
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": f"read failed: {exc}"}), 500


@opta_data_bp.route("/api/opta-data", methods=["GET"])
def get_opta_dataset():
    try:
        index = _load_index()
        dataset_id, doc = _resolve_dataset(index, str(request.args.get("datasetId") or ""))
        if doc is None:
            return jsonify(
                {
                    "ok": True,
                    "datasetId": dataset_id,
                    "selectedDatasetId": index.get("selectedDatasetId", ""),
                    "updatedAt": None,
                    "data": None,
                }
            )
        return jsonify(
            {
                "ok": True,
                "datasetId": dataset_id,
                "selectedDatasetId": index.get("selectedDatasetId", ""),
                "updatedAt": doc.get("updatedAt"),
                "data": doc,
            }
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": f"read failed: {exc}"}), 500


@opta_data_bp.route("/api/opta-data/datasets/<dataset_id>", methods=["DELETE"])
def delete_opta_dataset(dataset_id: str):
    try:
        index = _load_index()
        datasets = [d for d in index.get("datasets", []) if isinstance(d, dict)]
        matched = next((d for d in datasets if d.get("id") == dataset_id), None)
        if matched is None:
            return jsonify({"ok": False, "error": "dataset not found"}), 404

        path = _dataset_file_path(dataset_id)
        if path.exists():
            path.unlink()

        remaining = [d for d in datasets if d.get("id") != dataset_id]
        index["datasets"] = remaining
        if index.get("selectedDatasetId") == dataset_id:
            index["selectedDatasetId"] = remaining[0].get("id") if remaining else ""
        index["updatedAt"] = _iso_now()
        _write_index(index)

        return jsonify(
            {
                "ok": True,
                "deletedDatasetId": dataset_id,
                "selectedDatasetId": index.get("selectedDatasetId", ""),
                "datasets": remaining,
            }
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": f"delete failed: {exc}"}), 500
