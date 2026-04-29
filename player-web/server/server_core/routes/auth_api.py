from __future__ import annotations

from flask import Blueprint, jsonify, request, session

from server_core.services.auth_config import get_primary_login_username, is_valid_login
from server_core.services.session_auth import AUTH_FLAG_KEY, AUTH_USERNAME_KEY, get_authenticated_username, is_authenticated


auth_bp = Blueprint("auth_api", __name__)

@auth_bp.route("/api/auth/status", methods=["GET"])
def auth_status():
    return jsonify(
        {
            "ok": True,
            "authenticated": is_authenticated(),
            "username": get_authenticated_username(),
            "usernameHint": get_primary_login_username(),
        }
    )


@auth_bp.route("/api/auth/login", methods=["POST"])
def auth_login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))

    if not is_valid_login(username, password):
        return jsonify({"ok": False, "error": "账号或密码错误。"}), 401

    session.clear()
    session[AUTH_FLAG_KEY] = True
    session[AUTH_USERNAME_KEY] = username
    session.permanent = False
    return jsonify({"ok": True, "authenticated": True, "username": username})


@auth_bp.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"ok": True, "authenticated": False})
