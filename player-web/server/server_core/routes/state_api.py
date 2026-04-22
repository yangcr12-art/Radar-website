from __future__ import annotations

from flask import Blueprint, jsonify, request

from server_core.services.state_store import (
    VERSION,
    build_state_doc,
    load_state_doc,
    normalize_state_payload,
    validate_state_payload,
    write_state_doc,
)


state_bp = Blueprint("state_api", __name__)


@state_bp.route("/api/state", methods=["GET"])
def get_state():
    try:
        doc = load_state_doc()
        if doc is None:
            return jsonify({"ok": True, "version": VERSION, "updatedAt": None, "data": None})
        data = doc.get("data")
        return jsonify(
            {
                "ok": True,
                "version": int(doc.get("version", VERSION)),
                "updatedAt": doc.get("updatedAt"),
                "data": normalize_state_payload(data) if isinstance(data, dict) else data,
            }
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": f"read failed: {exc}"}), 500


@state_bp.route("/api/state", methods=["PUT"])
def put_state():
    payload = request.get_json(silent=True)
    ok, message = validate_state_payload(payload)
    if not ok:
        return jsonify({"ok": False, "error": message}), 400
    try:
        doc = build_state_doc(normalize_state_payload(payload))
        write_state_doc(doc)
        return jsonify({"ok": True, "updatedAt": doc["updatedAt"]})
    except Exception as exc:
        return jsonify({"ok": False, "error": f"write failed: {exc}"}), 500


@state_bp.route("/api/migrate-from-local", methods=["POST"])
def migrate_from_local():
    payload = request.get_json(silent=True)
    ok, message = validate_state_payload(payload)
    if not ok:
        return jsonify({"ok": False, "error": message}), 400
    try:
        existing = load_state_doc()
        if existing and existing.get("data"):
            return jsonify({"ok": True, "migrated": False, "skipped": True})
        doc = build_state_doc(normalize_state_payload(payload))
        doc["migrationSource"] = "localStorage"
        write_state_doc(doc)
        return jsonify({"ok": True, "migrated": True, "skipped": False, "updatedAt": doc["updatedAt"]})
    except Exception as exc:
        return jsonify({"ok": False, "error": f"migrate failed: {exc}"}), 500
