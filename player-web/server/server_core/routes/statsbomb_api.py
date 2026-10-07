from __future__ import annotations

from flask import Blueprint, jsonify, request

from server_core.services.statsbomb_client import (
    StatsBombConfigurationError,
    StatsBombDependencyError,
    StatsBombRequestError,
    build_league_table,
    get_statsbomb_status,
    list_competitions,
    list_matches,
    list_player_season_stats,
    list_team_season_stats,
)
from server_core.services.statsbomb_classic_store import (
    StatsBombClassicCsvError,
    delete_classic_dataset,
    get_classic_dataset,
    list_classic_datasets,
    save_classic_dataset,
)


statsbomb_bp = Blueprint("statsbomb_api", __name__)


@statsbomb_bp.route("/api/statsbomb/classic/import-csv", methods=["POST"])
def statsbomb_classic_import_csv():
    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"ok": False, "error": "请选择 StatsBomb Scout 下载的 CSV 文件。"}), 400
    try:
        result = save_classic_dataset(file.read(), file.filename)
        return jsonify({"ok": True, **result})
    except StatsBombClassicCsvError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "StatsBomb CSV 保存失败。"}), 500


@statsbomb_bp.route("/api/statsbomb/classic/datasets", methods=["GET"])
def statsbomb_classic_datasets():
    try:
        return jsonify({"ok": True, **list_classic_datasets()})
    except Exception:
        return jsonify({"ok": False, "error": "StatsBomb CSV 数据集读取失败。"}), 500


@statsbomb_bp.route("/api/statsbomb/classic/player-stats", methods=["GET"])
def statsbomb_classic_player_stats():
    try:
        dataset_id, doc = get_classic_dataset(str(request.args.get("datasetId") or ""))
        if doc is None:
            return jsonify({"ok": True, "datasetId": dataset_id, "data": None})
        return jsonify({"ok": True, "datasetId": dataset_id, "data": doc})
    except Exception:
        return jsonify({"ok": False, "error": "StatsBomb CSV 数据读取失败。"}), 500


@statsbomb_bp.route("/api/statsbomb/classic/datasets/<dataset_id>", methods=["DELETE"])
def statsbomb_classic_delete_dataset(dataset_id: str):
    try:
        result = delete_classic_dataset(dataset_id)
        if result is None:
            return jsonify({"ok": False, "error": "StatsBomb CSV 数据集不存在。"}), 404
        return jsonify({"ok": True, **result})
    except Exception:
        return jsonify({"ok": False, "error": "StatsBomb CSV 数据集删除失败。"}), 500


def _error_response(exc: Exception):
    if isinstance(exc, (StatsBombConfigurationError, StatsBombDependencyError)):
        return jsonify({"ok": False, "error": str(exc)}), 503
    if isinstance(exc, StatsBombRequestError):
        return jsonify({"ok": False, "error": str(exc)}), 502
    return jsonify({"ok": False, "error": "StatsBomb 服务暂时不可用。"}), 500


@statsbomb_bp.route("/api/statsbomb/status", methods=["GET"])
def statsbomb_status():
    return jsonify({"ok": True, **get_statsbomb_status()})


@statsbomb_bp.route("/api/statsbomb/test-connection", methods=["POST"])
def statsbomb_test_connection():
    try:
        competitions = list_competitions()
        return jsonify(
            {
                "ok": True,
                "connected": True,
                "competitionSeasonCount": len(competitions),
                "status": get_statsbomb_status(),
            }
        )
    except Exception as exc:
        return _error_response(exc)


@statsbomb_bp.route("/api/statsbomb/competitions", methods=["GET"])
def statsbomb_competitions():
    try:
        competitions = list_competitions()
        return jsonify({"ok": True, "competitions": competitions, "count": len(competitions)})
    except Exception as exc:
        return _error_response(exc)


@statsbomb_bp.route("/api/statsbomb/matches", methods=["GET"])
def statsbomb_matches():
    try:
        competition_id = int(str(request.args.get("competitionId") or ""))
        season_id = int(str(request.args.get("seasonId") or ""))
    except ValueError:
        return jsonify({"ok": False, "error": "competitionId 和 seasonId 必须是整数。"}), 400
    if competition_id <= 0 or season_id <= 0:
        return jsonify({"ok": False, "error": "competitionId 和 seasonId 必须是正整数。"}), 400
    try:
        matches = list_matches(competition_id, season_id)
        return jsonify(
            {
                "ok": True,
                "competitionId": competition_id,
                "seasonId": season_id,
                "matches": matches,
                "count": len(matches),
            }
        )
    except Exception as exc:
        return _error_response(exc)


def _competition_season_args():
    try:
        competition_id = int(str(request.args.get("competitionId") or ""))
        season_id = int(str(request.args.get("seasonId") or ""))
    except ValueError as exc:
        raise ValueError("competitionId 和 seasonId 必须是整数。") from exc
    if competition_id <= 0 or season_id <= 0:
        raise ValueError("competitionId 和 seasonId 必须是正整数。")
    return competition_id, season_id


@statsbomb_bp.route("/api/statsbomb/team-season-stats", methods=["GET"])
def statsbomb_team_season_stats():
    try:
        competition_id, season_id = _competition_season_args()
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    try:
        stats = list_team_season_stats(competition_id, season_id)
        return jsonify({"ok": True, "stats": stats, "count": len(stats)})
    except Exception as exc:
        return _error_response(exc)


@statsbomb_bp.route("/api/statsbomb/player-season-stats", methods=["GET"])
def statsbomb_player_season_stats():
    try:
        competition_id, season_id = _competition_season_args()
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    try:
        players = list_player_season_stats(competition_id, season_id)
        return jsonify({"ok": True, "players": players, "count": len(players)})
    except Exception as exc:
        return _error_response(exc)


@statsbomb_bp.route("/api/statsbomb/league-table", methods=["GET"])
def statsbomb_league_table():
    try:
        competition_id, season_id = _competition_season_args()
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    try:
        matches = list_matches(competition_id, season_id)
        warning = ""
        try:
            team_stats = list_team_season_stats(competition_id, season_id)
        except StatsBombRequestError:
            team_stats = []
            warning = "球队赛季聚合统计当前不可用，积分表仍按已提供比赛结果计算。"
        result = build_league_table(matches, team_stats)
        return jsonify(
            {
                "ok": True,
                "competitionId": competition_id,
                "seasonId": season_id,
                "matches": matches,
                "teamStats": team_stats,
                "warning": warning,
                **result,
            }
        )
    except Exception as exc:
        return _error_response(exc)
