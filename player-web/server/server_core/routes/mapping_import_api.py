from __future__ import annotations

from flask import Blueprint, jsonify, request
from openpyxl import load_workbook

from server_core.services.player_dataset_store import pick_name_column, pick_team_column, to_cell_value, normalize_header_name


mapping_import_bp = Blueprint("mapping_import_api", __name__)


@mapping_import_bp.route("/api/name-mapping/import-excel", methods=["POST"])
def import_name_mapping_excel():
    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"ok": False, "error": "missing file"}), 400
    if not file.filename.lower().endswith(".xlsx"):
        return jsonify({"ok": False, "error": "only .xlsx is supported"}), 400
    try:
        wb = load_workbook(file, data_only=True, read_only=True)
    except Exception as exc:
        return jsonify({"ok": False, "error": f"invalid excel file: {exc}"}), 400

    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if len(rows) < 2:
        return jsonify({"ok": False, "error": "excel must contain header and data rows"}), 400

    headers = [str(to_cell_value(x)).strip() for x in rows[0]]
    name_col_idx, name_col = pick_name_column(headers)
    if name_col_idx < 0:
        return jsonify({"ok": False, "error": "missing required name column (Player/Name)"}), 400
    team_col_idx, team_col = pick_team_column(headers)

    names: list[str] = []
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for excel_row in rows[1:]:
        cells = list(excel_row)
        name_value = cells[name_col_idx] if name_col_idx < len(cells) else None
        name = str(to_cell_value(name_value)).strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        names.append(name)
        team_value = cells[team_col_idx] if team_col_idx >= 0 and team_col_idx < len(cells) else None
        team_en = str(to_cell_value(team_value)).strip()
        items.append({"name": name, "teamEn": team_en})

    if not names:
        return jsonify({"ok": False, "error": "no valid name rows found"}), 400

    return jsonify(
        {
            "ok": True,
            "names": names,
            "items": items,
            "count": len(names),
            "sheet": ws.title,
            "column": name_col,
            "teamColumn": team_col,
        }
    )


@mapping_import_bp.route("/api/project-mapping/import-excel", methods=["POST"])
def import_project_mapping_excel():
    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"ok": False, "error": "missing file"}), 400
    if not file.filename.lower().endswith(".xlsx"):
        return jsonify({"ok": False, "error": "only .xlsx is supported"}), 400
    try:
        wb = load_workbook(file, data_only=True, read_only=True)
    except Exception as exc:
        return jsonify({"ok": False, "error": f"invalid excel file: {exc}"}), 400

    ws = wb.active
    rows = list(ws.iter_rows(values_only=True, max_row=1))
    wb.close()
    if not rows:
        return jsonify({"ok": False, "error": "excel must contain at least one header row"}), 400

    seen: set[str] = set()
    columns: list[str] = []
    for cell in list(rows[0]):
        header = str(to_cell_value(cell)).strip()
        if not header:
            continue
        key = normalize_header_name(header)
        if not key or key in seen:
            continue
        seen.add(key)
        columns.append(header)

    if not columns:
        return jsonify({"ok": False, "error": "no valid header columns found"}), 400

    return jsonify(
        {
            "ok": True,
            "sheet": ws.title,
            "columns": columns,
            "count": len(columns),
        }
    )
