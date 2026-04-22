from __future__ import annotations

from flask import Blueprint, jsonify, request

from server_core.services.player_dataset_store import (
    build_player_columns,
    delete_player_dataset_doc,
    import_player_excel_bytes,
    load_player_index,
    normalize_player_dataset_doc,
    resolve_dataset,
)


player_data_bp = Blueprint("player_data_api", __name__)


@player_data_bp.route("/api/player-data/import-excel", methods=["POST"])
def import_player_data_excel():
    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"ok": False, "error": "missing file"}), 400
    try:
        result = import_player_excel_bytes(file.filename, file.read())
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"ok": False, "error": f"write failed: {exc}"}), 500
    return jsonify({"ok": True, **result})


@player_data_bp.route("/api/player-data", methods=["GET"])
def get_player_data():
    try:
        index = load_player_index()
        dataset_id, doc = resolve_dataset(index, str(request.args.get("datasetId") or ""))
        if doc is None:
            return jsonify({"ok": True, "data": None, "updatedAt": None, "datasetId": dataset_id, "selectedDatasetId": index.get("selectedDatasetId")})
        doc = normalize_player_dataset_doc(doc)
        return jsonify(
            {
                "ok": True,
                "updatedAt": doc.get("updatedAt"),
                "datasetId": dataset_id,
                "selectedDatasetId": index.get("selectedDatasetId"),
                "data": doc,
            }
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": f"read failed: {exc}"}), 500


@player_data_bp.route("/api/player-data/datasets", methods=["GET"])
def get_player_datasets():
    try:
        index = load_player_index()
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


@player_data_bp.route("/api/player-data/datasets/<dataset_id>", methods=["DELETE"])
def delete_player_dataset(dataset_id: str):
    try:
        result = delete_player_dataset_doc(dataset_id)
        return jsonify({"ok": True, **result})
    except FileNotFoundError:
        return jsonify({"ok": False, "error": "dataset not found"}), 404
    except Exception as exc:
        return jsonify({"ok": False, "error": f"delete failed: {exc}"}), 500


@player_data_bp.route("/api/player-data/players", methods=["GET"])
def get_player_list():
    try:
        index = load_player_index()
        dataset_id, doc = resolve_dataset(index, str(request.args.get("datasetId") or ""))
        if doc is None:
            return jsonify({"ok": True, "players": [], "playerCount": 0, "updatedAt": None, "numericColumns": [], "datasetId": dataset_id, "selectedDatasetId": index.get("selectedDatasetId", "")})
        doc = normalize_player_dataset_doc(doc)
        players = doc.get("players", [])
        items = [{"id": p.get("id"), "player": p.get("player")} for p in players if p.get("id") and p.get("player")]
        schema = doc.get("schema", {})
        return jsonify(
            {
                "ok": True,
                "players": items,
                "playerCount": len(items),
                "datasetId": dataset_id,
                "selectedDatasetId": index.get("selectedDatasetId", ""),
                "updatedAt": doc.get("updatedAt"),
                "numericColumns": schema.get("numericColumns", []),
            }
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": f"read failed: {exc}"}), 500


@player_data_bp.route("/api/player-data/player/<player_id>", methods=["GET"])
def get_player_detail(player_id: str):
    try:
        index = load_player_index()
        dataset_id, doc = resolve_dataset(index, str(request.args.get("datasetId") or ""))
        if doc is None:
            return jsonify({"ok": False, "error": "player dataset not found"}), 404
        doc = normalize_player_dataset_doc(doc)
        players = doc.get("players", [])
        selected = next((p for p in players if p.get("id") == player_id), None)
        if selected is None:
            return jsonify({"ok": False, "error": "player not found"}), 404
        schema = doc.get("schema", {})
        return jsonify(
            {
                "ok": True,
                "player": {
                    "id": selected.get("id"),
                    "player": selected.get("player"),
                    "columns": build_player_columns(selected, schema),
                },
                "datasetId": dataset_id,
                "selectedDatasetId": index.get("selectedDatasetId", ""),
                "updatedAt": doc.get("updatedAt"),
            }
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": f"read failed: {exc}"}), 500
