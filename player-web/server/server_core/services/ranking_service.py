from __future__ import annotations

from typing import Any, Callable


def is_lower_better_column(column_name: str) -> bool:
    text = str(column_name or "").strip().lower()
    return "foul" in text or "犯规" in text


def compute_player_metrics(
    players: list[dict[str, Any]],
    candidate_numeric_cols: list[str],
    to_float_fn: Callable[[Any], float | None],
    is_lower_better_fn: Callable[[str], bool] = is_lower_better_column,
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
        values = numeric_values_by_col.get(col, [])
        if not values:
            continue
        numeric_columns.append(col)
        lower_better = is_lower_better_fn(col)
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

        n = len(values_sorted)
        for player_pos, val in values:
            rank = rank_map[player_pos]
            percentile = 100.0 if n == 1 else ((n - rank) / (n - 1)) * 100
            players[player_pos]["metrics"][col] = {
                "value": val,
                "rank": rank,
                "percentile": round(percentile, 2),
            }

    return numeric_columns, lower_better_columns


def normalize_player_dataset_doc(
    doc: dict[str, Any],
    to_float_fn: Callable[[Any], float | None],
    is_lower_better_fn: Callable[[str], bool] = is_lower_better_column,
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
