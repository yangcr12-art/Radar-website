from __future__ import annotations

from flask import Blueprint, jsonify, request

from server_core.services.mapping_state import load_mapping_payload, recover_mapping_payload_from_backup, save_mapping_payload


mappings_bp = Blueprint("mappings_api", __name__)


@mappings_bp.route("/api/mappings", methods=["GET"])
def get_mappings():
    try:
        recover_mapping_payload_from_backup()
        return jsonify({"ok": True, "data": load_mapping_payload()})
    except Exception as exc:
        return jsonify({"ok": False, "error": f"read failed: {exc}"}), 500


@mappings_bp.route("/api/mappings", methods=["PUT"])
def put_mappings():
    payload = request.get_json(silent=True)
    try:
        doc = save_mapping_payload(payload)
        return jsonify({"ok": True, "updatedAt": doc.get("updatedAt"), "data": load_mapping_payload()})
    except Exception as exc:
        return jsonify({"ok": False, "error": f"write failed: {exc}"}), 500
