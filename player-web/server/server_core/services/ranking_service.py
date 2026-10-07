from __future__ import annotations

from typing import Any, Callable

from server_core.services.percentile_algorithm import (
    EVENT_NEGATIVE,
    EVENT_POSITIVE,
    EXCLUDE,
    STANDARD_NEGATIVE,
    default_percentile_algorithm,
    percentile_algorithm_label,
    resolve_percentile_algorithm,
)
from server_core.services.percentile_service import percentile_pair, percentile_pair_for_algorithm, smoothing_profile


def is_lower_better_column(column_name: str) -> bool:
    return default_percentile_algorithm(column_name) in {STANDARD_NEGATIVE, EVENT_NEGATIVE}


def compute_player_metrics(
    players: list[dict[str, Any]],
    candidate_numeric_cols: list[str],
    to_float_fn: Callable[[Any], float | None],
    is_lower_better_fn: Callable[[str], bool] = is_lower_better_column,
    algorithm_by_column: dict[str, str] | None = None,
) -> tuple[list[str], list[str]]:
    numeric_values_by_col: dict[str, list[tuple[int, float]]] = {}
    for player in players:
        player["metrics"] = {}

    for player_pos, player in enumerate(players):
        raw = player.get("raw", {})
        if not isinstance(raw, dict):
            raw = {}
            player["raw"] = raw
        for col in candidate_numeric_cols:
            num = to_float_fn(raw.get(col))
            if num is not None:
                numeric_values_by_col.setdefault(col, []).append((player_pos, num))

    numeric_columns: list[str] = []
    lower_better_columns: list[str] = []
    for col in candidate_numeric_cols:
        algorithm = resolve_percentile_algorithm(col, algorithm_by_column) if algorithm_by_column is not None else (
            STANDARD_NEGATIVE if is_lower_better_fn(col) else "standard_positive"
        )
        if algorithm == EXCLUDE:
            continue
        values = numeric_values_by_col.get(col, [])
        if not values:
            continue
        numeric_columns.append(col)
        lower_better = algorithm in {STANDARD_NEGATIVE, EVENT_NEGATIVE}
        if lower_better:
            lower_better_columns.append(col)
        values_sorted = sorted(values, key=lambda x: x[1], reverse=not lower_better)
        rank_map: dict[int, int] = {}
        prev_val: float | None = None
        current_rank = 0
        for pos, (player_pos, val) in enumerate(values_sorted, start=1):
            if prev_val is None or val != prev_val:
                current_rank = pos
            rank_map[player_pos] = current_rank
            prev_val = val

        ascending_values = sorted(value for _, value in values)
        smoothing = smoothing_profile(ascending_values)
        for player_pos, val in values:
            rank = rank_map[player_pos]
            percentiles = percentile_pair_for_algorithm(
                ascending_values,
                val,
                algorithm=algorithm,
                alpha=smoothing["alpha"],
            ) if algorithm_by_column is not None else percentile_pair(
                ascending_values, val, higher_is_better=not lower_better, alpha=smoothing["alpha"]
            )
            mode_label = percentile_algorithm_label(algorithm)
            if algorithm == EVENT_POSITIVE:
                algorithm_reason = f"{mode_label}：零值按并列占比压缩到0-8分；正值按非零排名75%与对数强度25%评分；最大正值100，全体同值50"
            elif algorithm == EVENT_NEGATIVE:
                algorithm_reason = f"{mode_label}：先按稀疏事件正向评分再取100减分；最大事件值0，全体同值50"
            else:
                algorithm_reason = f"{mode_label}；{smoothing['reason']}"
            players[player_pos]["metrics"][col] = {
                "value": val,
                "rank": rank,
                "percentile": round(percentiles["rawPercentile"], 2),
                "rawPercentile": round(percentiles["rawPercentile"], 2),
                "adjustedPercentile": round(percentiles["adjustedPercentile"], 2),
                "smoothingAlpha": round(float(smoothing["alpha"]), 3),
                "zeroShare": round(float(smoothing["zeroShare"]), 3),
                "zeroFloorPercentile": smoothing["zeroFloorPercentile"],
                "smoothingReason": algorithm_reason,
                "percentileAlgorithm": algorithm,
                "percentileAlgorithmLabel": mode_label,
            }

    return numeric_columns, lower_better_columns


def normalize_player_dataset_doc(
    doc: dict[str, Any],
    to_float_fn: Callable[[Any], float | None],
    is_lower_better_fn: Callable[[str], bool] = is_lower_better_column,
    algorithm_by_column: dict[str, str] | None = None,
) -> dict[str, Any]:
    players = doc.get("players", [])
    if not isinstance(players, list) or not players:
        return doc

    schema = doc.get("schema", {})
    if not isinstance(schema, dict):
        schema = {}

    player_column = str(schema.get("playerColumn") or "player")
    all_columns = schema.get("allColumns")
    if not isinstance(all_columns, list) or not all_columns:
        first_raw = players[0].get("raw", {}) if isinstance(players[0], dict) else {}
        all_columns = list(first_raw.keys()) if isinstance(first_raw, dict) else []
    normalized_all_columns = [str(col) for col in all_columns if str(col).strip()]
    candidate_numeric_cols = [col for col in normalized_all_columns if col.lower() != player_column.lower()]

    numeric_columns, lower_better_columns = compute_player_metrics(
        players,
        candidate_numeric_cols,
        to_float_fn=to_float_fn,
        is_lower_better_fn=is_lower_better_fn,
        algorithm_by_column=algorithm_by_column,
    )
    for player in players:
        player.pop("_numeric", None)
        player.pop("_rowIndex", None)

    schema["playerColumn"] = player_column
    schema["allColumns"] = normalized_all_columns
    schema["numericColumns"] = numeric_columns
    schema["lowerBetterColumns"] = lower_better_columns
    doc["schema"] = schema
    doc["players"] = players
    return doc
