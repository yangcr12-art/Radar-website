from __future__ import annotations

from typing import Any


STANDARD_POSITIVE = "standard_positive"
STANDARD_NEGATIVE = "standard_negative"
EVENT_POSITIVE = "event_positive"
EVENT_NEGATIVE = "event_negative"
EXCLUDE = "exclude"

VALID_PERCENTILE_ALGORITHMS = {
    STANDARD_POSITIVE,
    STANDARD_NEGATIVE,
    EVENT_POSITIVE,
    EVENT_NEGATIVE,
    EXCLUDE,
}

PERCENTILE_ALGORITHM_LABELS = {
    STANDARD_POSITIVE: "普通正向",
    STANDARD_NEGATIVE: "普通反向",
    EVENT_POSITIVE: "稀疏事件正向",
    EVENT_NEGATIVE: "稀疏事件反向",
    EXCLUDE: "不参与评分",
}

_ALIASES = {
    STANDARD_POSITIVE: STANDARD_POSITIVE,
    "普通正向": STANDARD_POSITIVE,
    STANDARD_NEGATIVE: STANDARD_NEGATIVE,
    "普通反向": STANDARD_NEGATIVE,
    EVENT_POSITIVE: EVENT_POSITIVE,
    "稀疏事件正向": EVENT_POSITIVE,
    EVENT_NEGATIVE: EVENT_NEGATIVE,
    "稀疏事件反向": EVENT_NEGATIVE,
    EXCLUDE: EXCLUDE,
    "不参与": EXCLUDE,
    "不参与评分": EXCLUDE,
}

_EXCLUDED_COLUMNS = {
    "player", "team", "team within selected timeframe", "position", "age", "market value",
    "contract expires", "matches played", "minutes played", "birth country", "passport country",
    "foot", "height", "weight", "on loan",
}

_EVENT_POSITIVE_COLUMNS = {
    "goals", "goals per 90", "non-penalty goals", "non-penalty goals per 90", "head goals",
    "head goals per 90", "assists", "assists per 90", "second assists per 90",
    "third assists per 90", "clean sheets", "shot assists per 90", "smart passes per 90",
    "key passes per 90", "through passes per 90", "free kicks per 90",
    "direct free kicks per 90", "corners per 90", "penalties taken",
}

_EVENT_NEGATIVE_COLUMNS = {
    "yellow cards", "yellow cards per 90", "red cards", "red cards per 90", "conceded goals",
    "conceded goals per 90",
}

_STANDARD_NEGATIVE_COLUMNS = {
    "fouls per 90",
    "xg against",
    "xg against per 90",
    "losses per 90",
}


def _key(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_percentile_algorithm(value: Any, fallback: str = STANDARD_POSITIVE) -> str:
    normalized = _ALIASES.get(_key(value))
    if normalized:
        return normalized
    return fallback if fallback in VALID_PERCENTILE_ALGORITHMS else STANDARD_POSITIVE


def default_percentile_algorithm(column_name: Any) -> str:
    key = _key(column_name)
    if key in _EXCLUDED_COLUMNS:
        return EXCLUDE
    if key in _EVENT_POSITIVE_COLUMNS:
        return EVENT_POSITIVE
    if key in _EVENT_NEGATIVE_COLUMNS:
        return EVENT_NEGATIVE
    if key in _STANDARD_NEGATIVE_COLUMNS:
        return STANDARD_NEGATIVE
    return STANDARD_POSITIVE


def percentile_algorithm_label(value: Any, fallback: str = STANDARD_POSITIVE) -> str:
    return PERCENTILE_ALGORITHM_LABELS[normalize_percentile_algorithm(value, fallback)]


def build_percentile_algorithm_map(rows: Any) -> dict[str, str]:
    result: dict[str, str] = {}
    if not isinstance(rows, list):
        return result
    for row in rows:
        if not isinstance(row, dict):
            continue
        en = str(row.get("en") or "").strip()
        key = _key(en)
        if not key:
            continue
        result[key] = normalize_percentile_algorithm(
            row.get("percentileAlgorithm"),
            default_percentile_algorithm(en),
        )
    return result


def resolve_percentile_algorithm(column_name: Any, algorithm_by_column: dict[str, str] | None = None) -> str:
    key = _key(column_name)
    configured = algorithm_by_column.get(key) if algorithm_by_column else None
    return normalize_percentile_algorithm(configured, default_percentile_algorithm(column_name))
