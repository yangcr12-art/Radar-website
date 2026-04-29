from __future__ import annotations

import os
from urllib.parse import urlparse

from flask import Flask, jsonify, request

from server_core.routes.auth_api import auth_bp
from server_core.routes.csl_standings_api import csl_standings_bp
from server_core.routes.fitness_data_api import fitness_data_bp
from server_core.routes.mapping_import_api import mapping_import_bp
from server_core.routes.match_data_api import match_data_bp
from server_core.routes.match_project_mapping_api import match_project_mapping_bp
from server_core.routes.opta_data_api import opta_data_bp
from server_core.routes.player_data_api import player_data_bp
from server_core.routes.state_api import state_bp
from server_core.services.auth_config import get_session_secret
from server_core.services.ranking_service import is_lower_better_column as _ranking_service_marker
from server_core.services.session_auth import is_authenticated
from server_core.services.state_store import iso_now
from server_core.services.user_storage import ensure_data_dir, initialize_user_storage


ensure_data_dir()
initialize_user_storage()

app = Flask(__name__)
app.secret_key = get_session_secret()
app.config["SESSION_COOKIE_NAME"] = "player_web_session"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = False
app.config["SESSION_PERMANENT"] = False
app.register_blueprint(auth_bp)
app.register_blueprint(match_data_bp)
app.register_blueprint(match_project_mapping_bp)
app.register_blueprint(fitness_data_bp)
app.register_blueprint(opta_data_bp)
app.register_blueprint(csl_standings_bp)
app.register_blueprint(state_bp)
app.register_blueprint(player_data_bp)
app.register_blueprint(mapping_import_bp)


PUBLIC_API_PATHS = {
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/status",
    "/api/health",
}


def _allowed_origin() -> str | None:
    origin = request.headers.get("Origin", "").strip()
    if not origin:
        return None

    parsed = urlparse(origin)
    if parsed.netloc == request.host:
        return origin

    allowed = {
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    }
    extra = {item.strip() for item in os.environ.get("PLAYER_WEB_ALLOWED_ORIGINS", "").split(",") if item.strip()}
    allowed.update(extra)
    return origin if origin in allowed else None


def _corsify_response(resp):
    allowed_origin = _allowed_origin()
    if allowed_origin:
        resp.headers["Access-Control-Allow-Origin"] = allowed_origin
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Vary"] = "Origin"
    resp.headers["Access-Control-Allow-Methods"] = "GET,PUT,POST,DELETE,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.after_request
def _after_request(resp):
    return _corsify_response(resp)


@app.before_request
def require_shared_login():
    if not request.path.startswith("/api/"):
        return None
    if request.method == "OPTIONS":
        return None
    if request.path in PUBLIC_API_PATHS:
        return None
    if is_authenticated():
        return None
    return jsonify({"ok": False, "error": "请先登录。", "authRequired": True}), 401


@app.route("/api/<path:_path>", methods=["OPTIONS"])
def options_handler(_path: str):
    return _corsify_response(jsonify({"ok": True}))


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "ts": iso_now()})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8787, debug=False)
