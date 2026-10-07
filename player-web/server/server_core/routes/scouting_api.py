from __future__ import annotations

from flask import Blueprint, jsonify, request

from server_core.services.player_dataset_store import load_player_index, resolve_dataset
from server_core.services.mapping_state import load_mapping_payload
from server_core.services.percentile_algorithm import build_percentile_algorithm_map
from server_core.services.scouting_model import (
    DEFAULT_RELIABILITY_MINUTES,
    evaluate_scouting_role,
    list_scouting_models,
)


scouting_bp = Blueprint("scouting_api", __name__)


@scouting_bp.route("/api/scout-search/models", methods=["GET"])
def get_scouting_models():
    return jsonify({"ok": True, "models": list_scouting_models()})


@scouting_bp.route("/api/scout-search/evaluate", methods=["POST"])
def evaluate_scouting_model():
    payload = request.get_json(silent=True) or {}
    role_id = str(payload.get("roleId") or "inverted_right_winger_left_foot")

    index = load_player_index()
    dataset_id, doc = resolve_dataset(index, str(payload.get("datasetId") or ""))
    if doc is None:
        return jsonify({"ok": False, "error": "未找到球员数据集"}), 404

    try:
        mapping_payload = load_mapping_payload()
        result = evaluate_scouting_role(
            doc,
            role_id=role_id,
            early_season=bool(payload.get("earlySeason", False)),
            min_minutes=float(payload.get("minMinutes", 300)),
            min_avg_minutes=float(payload.get("minAvgMinutes", 15)),
            reliability_minutes=float(payload.get("reliabilityMinutes", DEFAULT_RELIABILITY_MINUTES)),
            percentile_algorithm_by_column=build_percentile_algorithm_map(mapping_payload.get("projectMappingRows")),
        )
    except (TypeError, ValueError) as exc:
        return jsonify({"ok": False, "error": f"参数错误：{exc}"}), 400
    if not result.get("ok"):
        return jsonify(result), 400
    return jsonify({**result, "datasetId": dataset_id, "selectedDatasetId": index.get("selectedDatasetId", "")})
