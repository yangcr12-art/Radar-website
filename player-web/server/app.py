from __future__ import annotations

from flask import Flask, jsonify

from server_core.routes.csl_standings_api import csl_standings_bp
from server_core.routes.fitness_data_api import fitness_data_bp
from server_core.routes.mapping_import_api import mapping_import_bp
from server_core.routes.match_data_api import match_data_bp
from server_core.routes.match_project_mapping_api import match_project_mapping_bp
from server_core.routes.opta_data_api import opta_data_bp
from server_core.routes.player_data_api import player_data_bp
from server_core.routes.state_api import state_bp
from server_core.services.player_dataset_store import ensure_player_data_dir
from server_core.services.ranking_service import is_lower_better_column as _ranking_service_marker
from server_core.services.state_store import ensure_data_dir, iso_now


app = Flask(__name__)
app.register_blueprint(match_data_bp)
app.register_blueprint(match_project_mapping_bp)
app.register_blueprint(fitness_data_bp)
app.register_blueprint(opta_data_bp)
app.register_blueprint(csl_standings_bp)
app.register_blueprint(state_bp)
app.register_blueprint(player_data_bp)
app.register_blueprint(mapping_import_bp)


def _corsify_response(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,PUT,POST,DELETE,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.after_request
def _after_request(resp):
    return _corsify_response(resp)


@app.route("/api/<path:_path>", methods=["OPTIONS"])
def options_handler(_path: str):
    return _corsify_response(jsonify({"ok": True}))


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "ts": iso_now()})


if __name__ == "__main__":
    ensure_data_dir()
    ensure_player_data_dir()
    app.run(host="127.0.0.1", port=8787, debug=False)
