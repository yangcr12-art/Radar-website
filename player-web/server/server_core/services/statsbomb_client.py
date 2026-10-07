from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from importlib import metadata
from typing import Any


class StatsBombConfigurationError(RuntimeError):
    pass


class StatsBombDependencyError(RuntimeError):
    pass


class StatsBombRequestError(RuntimeError):
    pass


_REQUEST_TIMEOUT_SECONDS = 25
_REQUEST_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="statsbomb-api")


def _credentials() -> dict[str, str]:
    username = os.environ.get("SB_USERNAME", "").strip()
    password = os.environ.get("SB_PASSWORD", "")
    missing = []
    if not username:
        missing.append("SB_USERNAME")
    if not password:
        missing.append("SB_PASSWORD")
    if missing:
        raise StatsBombConfigurationError(f"服务器尚未配置 StatsBomb 凭据：{', '.join(missing)}")
    return {"user": username, "passwd": password}


def _package_version() -> str | None:
    try:
        return metadata.version("statsbombpy")
    except metadata.PackageNotFoundError:
        return None


def _masked_username(username: str) -> str:
    text = str(username or "").strip()
    if not text:
        return ""
    if "@" in text:
        local, domain = text.split("@", 1)
        visible = local[:1] if local else ""
        return f"{visible}***@{domain}"
    return f"{text[:1]}***{text[-1:]}" if len(text) > 1 else "***"


def get_statsbomb_status() -> dict[str, Any]:
    username = os.environ.get("SB_USERNAME", "").strip()
    password = os.environ.get("SB_PASSWORD", "")
    package_version = _package_version()
    missing = []
    if not username:
        missing.append("SB_USERNAME")
    if not password:
        missing.append("SB_PASSWORD")
    return {
        "configured": not missing,
        "missingEnvironmentVariables": missing,
        "maskedUsername": _masked_username(username),
        "packageAvailable": package_version is not None,
        "packageVersion": package_version,
        "mode": "commercial-api",
    }


def _statsbomb_module():
    try:
        from statsbombpy import sb
    except ImportError as exc:
        raise StatsBombDependencyError("服务器尚未安装 statsbombpy。") from exc
    return sb


def _records(value: Any) -> list[dict[str, Any]]:
    if hasattr(value, "to_json"):
        payload = value.to_json(orient="records", date_format="iso")
        decoded = json.loads(payload)
        return decoded if isinstance(decoded, list) else []
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        return [item for item in value.values() if isinstance(item, dict)]
    return []


def _first(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value is not None and value != "":
            return value
    return None


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _normalized_key(value: Any) -> str:
    return "".join(character for character in str(value or "").lower() if character.isalnum())


def _metric(row: dict[str, Any], *aliases: str) -> float | None:
    normalized = {_normalized_key(key): value for key, value in row.items()}
    for alias in aliases:
        key = _normalized_key(alias)
        if key in normalized:
            return _as_float(normalized[key])
    return None


def _team_identity(row: dict[str, Any]) -> tuple[int | None, str]:
    team_id = _as_int(
        _first(
            row,
            "team_id",
            "team_season_team_id",
            "team_match_team_id",
            "player_season_team_id",
            "team.id",
        )
    )
    team_name = str(
        _first(
            row,
            "team_name",
            "team_season_team_name",
            "team_match_team_name",
            "player_season_team_name",
            "team.name",
        )
        or ""
    ).strip()
    return team_id, team_name


def _request_error(exc: Exception) -> StatsBombRequestError:
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None)
    if status_code == 401:
        return StatsBombRequestError("StatsBomb 认证失败，请检查账号、密码和 API 权限。")
    if status_code == 403:
        return StatsBombRequestError("StatsBomb 拒绝访问，请确认账号具有所选数据的 API 权限。")
    if status_code == 404:
        return StatsBombRequestError("StatsBomb 未找到请求的数据，可能不在当前账号授权范围内。")
    if status_code:
        return StatsBombRequestError(f"StatsBomb API 请求失败（HTTP {status_code}）。")
    message = str(exc).strip()
    if "timed out" in message.lower() or "timeout" in message.lower():
        return StatsBombRequestError("StatsBomb API 请求超时，请稍后重试。")
    return StatsBombRequestError("StatsBomb API 请求失败，请检查网络连接和账号权限。")


def _call_with_timeout(callback):
    future = _REQUEST_EXECUTOR.submit(callback)
    try:
        return future.result(timeout=_REQUEST_TIMEOUT_SECONDS)
    except FutureTimeoutError as exc:
        future.cancel()
        raise StatsBombRequestError("StatsBomb API 请求超过 25 秒，请稍后重试。") from exc


def list_competitions() -> list[dict[str, Any]]:
    creds = _credentials()
    sb = _statsbomb_module()
    try:
        raw_rows = _records(_call_with_timeout(lambda: sb.competitions(creds=creds)))
    except Exception as exc:
        if isinstance(exc, StatsBombRequestError):
            raise
        raise _request_error(exc) from exc
    if not raw_rows:
        raise StatsBombRequestError("账号未返回可读取的赛事赛季，请检查账号密码和商业 API 权限。")

    competitions = []
    for row in raw_rows:
        competition_id = _as_int(_first(row, "competition_id"))
        season_id = _as_int(_first(row, "season_id"))
        if competition_id is None or season_id is None:
            continue
        competitions.append(
            {
                "competitionId": competition_id,
                "seasonId": season_id,
                "countryName": _first(row, "country_name", "competition_country_name") or "",
                "competitionName": _first(row, "competition_name") or "",
                "seasonName": _first(row, "season_name") or "",
                "gender": _first(row, "competition_gender") or "",
                "matchAvailable": _first(row, "match_available") or "",
                "matchUpdated": _first(row, "match_updated") or "",
                "matchAvailable360": _first(row, "match_available_360") or "",
            }
        )
    competitions.sort(key=lambda item: (str(item["countryName"]), str(item["competitionName"]), str(item["seasonName"])), reverse=False)
    return competitions


def list_matches(competition_id: int, season_id: int) -> list[dict[str, Any]]:
    creds = _credentials()
    sb = _statsbomb_module()
    try:
        raw_rows = _records(
            _call_with_timeout(
                lambda: sb.matches(competition_id=competition_id, season_id=season_id, creds=creds)
            )
        )
    except Exception as exc:
        if isinstance(exc, StatsBombRequestError):
            raise
        raise _request_error(exc) from exc

    matches = []
    for row in raw_rows:
        match_id = _as_int(_first(row, "match_id"))
        if match_id is None:
            continue
        matches.append(
            {
                "matchId": match_id,
                "matchDate": _first(row, "match_date") or "",
                "kickOff": _first(row, "kick_off") or "",
                "homeTeam": _first(row, "home_team", "home_team_name") or "",
                "awayTeam": _first(row, "away_team", "away_team_name") or "",
                "homeScore": _first(row, "home_score"),
                "awayScore": _first(row, "away_score"),
                "matchStatus": _first(row, "match_status") or "",
                "collectionStatus": _first(row, "collection_status") or "",
                "lastUpdated": _first(row, "last_updated") or "",
            }
        )
    matches.sort(key=lambda item: (str(item["matchDate"]), str(item["kickOff"]), int(item["matchId"])), reverse=True)
    return matches


def list_team_season_stats(competition_id: int, season_id: int) -> list[dict[str, Any]]:
    creds = _credentials()
    sb = _statsbomb_module()
    try:
        raw_rows = _records(
            _call_with_timeout(
                lambda: sb.team_season_stats(
                    competition_id=competition_id,
                    season_id=season_id,
                    creds=creds,
                )
            )
        )
    except Exception as exc:
        if isinstance(exc, StatsBombRequestError):
            raise
        raise _request_error(exc) from exc

    stats = []
    for row in raw_rows:
        team_id, team_name = _team_identity(row)
        if not team_name:
            continue
        stats.append(
            {
                "teamId": team_id,
                "teamName": team_name,
                "xGFor": _metric(row, "team_season_xg", "team_season_xg_for", "xg", "xg_for"),
                "xGAgainst": _metric(
                    row,
                    "team_season_xg_conceded",
                    "team_season_xg_against",
                    "xg_conceded",
                    "xg_against",
                ),
                "shotsFor": _metric(row, "team_season_shots", "team_season_shots_for", "shots", "shots_for"),
                "shotsAgainst": _metric(
                    row,
                    "team_season_shots_conceded",
                    "team_season_shots_against",
                    "shots_conceded",
                    "shots_against",
                ),
                "goalsFor": _metric(row, "team_season_goals", "team_season_goals_for", "goals", "goals_for"),
                "goalsAgainst": _metric(
                    row,
                    "team_season_goals_conceded",
                    "team_season_goals_against",
                    "goals_conceded",
                    "goals_against",
                ),
                "passes": _metric(row, "team_season_passes", "passes"),
                "pressures": _metric(row, "team_season_pressures", "pressures"),
            }
        )
    stats.sort(key=lambda item: str(item["teamName"]).casefold())
    return stats


def list_player_season_stats(competition_id: int, season_id: int) -> list[dict[str, Any]]:
    creds = _credentials()
    sb = _statsbomb_module()
    try:
        raw_rows = _records(
            _call_with_timeout(
                lambda: sb.player_season_stats(
                    competition_id=competition_id,
                    season_id=season_id,
                    creds=creds,
                )
            )
        )
    except Exception as exc:
        if isinstance(exc, StatsBombRequestError):
            raise
        raise _request_error(exc) from exc

    players = []
    for row in raw_rows:
        player_id = _as_int(_first(row, "player_id", "player_season_player_id", "player.id"))
        player_name = str(
            _first(row, "player_name", "player_season_player_name", "player.name") or ""
        ).strip()
        _, team_name = _team_identity(row)
        if not player_name:
            continue
        players.append(
            {
                "playerId": player_id,
                "playerName": player_name,
                "teamName": team_name,
                "minutes": _metric(row, "player_season_minutes", "minutes"),
                "appearances": _metric(row, "player_season_appearances", "appearances"),
                "goals": _metric(row, "player_season_goals", "goals"),
                "assists": _metric(row, "player_season_assists", "assists"),
                "xG": _metric(row, "player_season_xg", "xg"),
                "xA": _metric(row, "player_season_xa", "xa"),
                "shots": _metric(row, "player_season_shots", "shots"),
                "obv": _metric(row, "player_season_obv", "obv"),
            }
        )
    players.sort(key=lambda item: (str(item["teamName"]).casefold(), str(item["playerName"]).casefold()))
    return players


def build_league_table(
    matches: list[dict[str, Any]], team_stats: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    table: dict[str, dict[str, Any]] = {}

    def ensure_team(name: str) -> dict[str, Any]:
        key = name.casefold()
        if key not in table:
            table[key] = {
                "teamName": name,
                "played": 0,
                "won": 0,
                "drawn": 0,
                "lost": 0,
                "goalsFor": 0,
                "goalsAgainst": 0,
                "goalDifference": 0,
                "points": 0,
                "xGFor": None,
                "xGAgainst": None,
                "xGDifference": None,
                "shotsFor": None,
                "shotsAgainst": None,
            }
        return table[key]

    included_matches = 0
    for match in matches:
        if str(match.get("matchStatus") or "").strip().lower() != "available":
            continue
        home_name = str(match.get("homeTeam") or "").strip()
        away_name = str(match.get("awayTeam") or "").strip()
        home_score = _as_int(match.get("homeScore"))
        away_score = _as_int(match.get("awayScore"))
        if not home_name or not away_name or home_score is None or away_score is None:
            continue
        home = ensure_team(home_name)
        away = ensure_team(away_name)
        included_matches += 1
        for row in (home, away):
            row["played"] += 1
        home["goalsFor"] += home_score
        home["goalsAgainst"] += away_score
        away["goalsFor"] += away_score
        away["goalsAgainst"] += home_score
        if home_score > away_score:
            home["won"] += 1
            home["points"] += 3
            away["lost"] += 1
        elif home_score < away_score:
            away["won"] += 1
            away["points"] += 3
            home["lost"] += 1
        else:
            home["drawn"] += 1
            away["drawn"] += 1
            home["points"] += 1
            away["points"] += 1

    for stat in team_stats or []:
        name = str(stat.get("teamName") or "").strip()
        if not name:
            continue
        row = ensure_team(name)
        for key in ("xGFor", "xGAgainst", "shotsFor", "shotsAgainst"):
            row[key] = _as_float(stat.get(key))

    rows = list(table.values())
    for row in rows:
        row["goalDifference"] = row["goalsFor"] - row["goalsAgainst"]
        if row["xGFor"] is not None and row["xGAgainst"] is not None:
            row["xGDifference"] = row["xGFor"] - row["xGAgainst"]
    rows.sort(
        key=lambda row: (
            -int(row["points"]),
            -int(row["goalDifference"]),
            -int(row["goalsFor"]),
            str(row["teamName"]).casefold(),
        )
    )
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    return {
        "rows": rows,
        "includedMatchCount": included_matches,
        "availableMatchCount": sum(
            1 for match in matches if str(match.get("matchStatus") or "").strip().lower() == "available"
        ),
        "totalMatchCount": len(matches),
        "teamStatsAvailable": bool(team_stats),
    }
