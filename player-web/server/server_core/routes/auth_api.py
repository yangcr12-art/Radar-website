from __future__ import annotations

from flask import Blueprint, jsonify, request, session

from server_core.services.auth_config import get_login_password, get_login_username


auth_bp = Blueprint("auth_api", __name__)


def is_authenticated() -> bool:
    return bool(session.get("player_web_authenticated"))


@auth_bp.route("/api/auth/status", methods=["GET"])
def auth_status():
    return jsonify(
        {
            "ok": True,
            "authenticated": is_authenticated(),
            "usernameHint": get_login_username(),
        }
    )


@auth_bp.route("/api/auth/login", methods=["POST"])
def auth_login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    expected_username = get_login_username()
    expected_password = get_login_password()

    if username != expected_username or password != expected_password:
        return jsonify({"ok": False, "error": "账号或密码错误。"}), 401

    session.clear()
    session["player_web_authenticated"] = True
    session["player_web_username"] = expected_username
    session.permanent = False
    return jsonify({"ok": True, "authenticated": True, "username": expected_username})


@auth_bp.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"ok": True, "authenticated": False})
