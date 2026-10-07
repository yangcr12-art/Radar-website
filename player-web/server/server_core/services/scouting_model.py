from __future__ import annotations

import re
from typing import Any

from server_core.services.percentile_algorithm import (
    EVENT_NEGATIVE,
    EVENT_POSITIVE,
    EXCLUDE,
    percentile_algorithm_label,
    resolve_percentile_algorithm,
)
from server_core.services.percentile_service import percentile_pair_for_algorithm, smoothing_profile
from server_core.services.forward_role_analysis import (
    ELITE_MAX_POINTS,
    ELITE_THRESHOLD,
    FORWARD_ROLE_IDS,
    PAIR_BAYES_FORMULA,
    PAIR_SCORE_FORMULA,
    PAIR_SPECS,
    PILLAR_SPECS,
    build_forward_archetypes,
    build_forward_pair_scores,
    elite_metric_score,
)
from server_core.services.winger_role_analysis import (
    WINGER_ANALYSIS_COLUMNS,
    WINGER_ROLE_IDS,
    build_winger_archetypes,
)
from server_core.services.attacking_midfielder_role_analysis import (
    ATTACKING_MIDFIELDER_ANALYSIS_COLUMNS,
    ATTACKING_MIDFIELDER_ROLE_IDS,
    build_attacking_midfielder_archetypes,
)
from server_core.services.central_midfielder_role_analysis import (
    CENTRAL_MIDFIELDER_ANALYSIS_COLUMNS,
    CENTRAL_MIDFIELDER_ROLE_IDS,
    build_central_midfielder_archetypes,
)
from server_core.services.defensive_midfielder_role_analysis import (
    DEFENSIVE_MIDFIELDER_ANALYSIS_COLUMNS,
    DEFENSIVE_MIDFIELDER_ROLE_IDS,
    build_defensive_midfielder_archetypes,
)
from server_core.services.scouting_role_catalog import ADDITIONAL_SCOUTING_MODELS


MODEL_VERSION = "inverted-right-winger-v6-five-dimensions"
DEFAULT_MIN_MINUTES = 300.0
DEFAULT_MIN_AVG_MINUTES = 15.0
DEFAULT_RELIABILITY_MINUTES = 500.0
MIN_METRIC_COHORT = 8


INVERTED_RIGHT_WINGER_MODEL: dict[str, Any] = {
    "id": "inverted_right_winger_left_foot",
    "version": MODEL_VERSION,
    "name": "逆足内切型边锋",
    "family": "边锋",
    "qualityLevel": "Research",
    "description": "在惯用脚相反一侧活动，向中路和禁区推进并形成射门或关键传球。",
    "positionTokens": ["RWF", "RW", "RAMF", "LWF", "LW", "LAMF"],
    "requiredFoot": "opposite_side",
    "footMode": "inverted_wide",
    "dimensions": [
        {
            "id": "physical_duels",
            "name": "身体对抗",
            "weight": 15,
            "metrics": [
                {"column": "Duels per 90", "weight": 3, "direction": "higher"},
                {"column": "Duels won, %", "weight": 5, "direction": "higher"},
                {"column": "Aerial duels per 90", "weight": 1, "direction": "higher"},
                {"column": "Aerial duels won, %", "weight": 2, "direction": "higher"},
                {"column": "Fouls suffered per 90", "weight": 4, "direction": "higher"},
            ],
        },
        {
            "id": "goal_threat",
            "name": "内切得分威胁",
            "weight": 30,
            "metrics": [
                {"column": "Non-penalty goals per 90", "weight": 8, "direction": "higher"},
                {
                    "column": "Goal - xG per 90",
                    "label": "Goal − xG（每90分钟）",
                    "weight": 6,
                    "direction": "higher",
                    "derived": {
                        "operation": "subtract",
                        "columns": ["Goals per 90", "xG per 90"],
                    },
                    "note": "全部进球/90减去xG/90，用于衡量总体实际进球相对总体预期进球的超额表现。",
                },
                {"column": "Shots per 90", "weight": 5, "direction": "higher"},
                {"column": "Shots on target, %", "weight": 6, "direction": "higher"},
                {"column": "Goal conversion, %", "weight": 5, "direction": "higher"},
            ],
        },
        {
            "id": "one_v_one_progression",
            "name": "一对一突破",
            "weight": 25,
            "metrics": [
                {"column": "Dribbles per 90", "weight": 5, "direction": "higher"},
                {"column": "Successful dribbles, %", "weight": 4, "direction": "higher"},
                {"column": "Offensive duels per 90", "weight": 3, "direction": "higher"},
                {"column": "Offensive duels won, %", "weight": 2, "direction": "higher"},
                {"column": "Successful attacking actions per 90", "weight": 4, "direction": "higher"},
                {"column": "Accelerations per 90", "weight": 3, "direction": "higher"},
                {"column": "Touches in box per 90", "weight": 4, "direction": "higher", "note": "当前源表缺少持球攻入禁区字段，暂以禁区触球作为禁区进入代理。"},
            ],
        },
        {
            "id": "progression_delivery",
            "name": "纵深推进与边路输出",
            "weight": 12,
            "metrics": [
                {"column": "Progressive runs per 90", "weight": 3, "direction": "higher"},
                {"column": "Max Speed (km/h)", "weight": 2, "direction": "higher"},
                {"column": "Crosses per 90", "weight": 2, "direction": "higher"},
                {"column": "Accurate crosses, %", "weight": 1, "direction": "higher"},
                {"column": "Crosses to goalie box per 90", "weight": 2, "direction": "higher"},
                {"column": "Deep completed crosses per 90", "weight": 2, "direction": "higher"},
            ],
        },
        {
            "id": "chance_creation",
            "name": "机会创造",
            "weight": 18,
            "metrics": [
                {"column": "xA per 90", "weight": 5, "direction": "higher"},
                {"column": "Key passes per 90", "weight": 4, "direction": "higher"},
                {"column": "Shot assists per 90", "weight": 3, "direction": "higher"},
                {"column": "Passes to penalty area per 90", "weight": 3, "direction": "higher"},
                {"column": "Progressive passes per 90", "weight": 2, "direction": "higher"},
                {"column": "Corners per 90", "weight": 0.5, "direction": "higher"},
                {"column": "Free kicks per 90", "weight": 0.5, "direction": "higher"},
            ],
        },
    ],
    "notScored": [
        {"column": "xG per 90", "reason": "不再单独计分，只作为 Goal − xG 的计算输入；非点球进球/90仍单独反映运动战与非点球产出。"},
        {"column": "Through passes per 90", "reason": "机会创造模块精简为xA、关键传球、助攻射门传球和传入禁区，不再使用直塞。"},
        {"column": "PAdj Interceptions", "reason": "五维边锋能力模型不设置独立防守维度，PAdj拦截不参与职责能力分。"},
        {"column": "Defensive duels won, %", "reason": "通用身体对抗模块已包含对抗成功率，不再重复加入防守对抗成功率。"},
        {"column": "Sprinting Distance per 90 (+25 km/h)", "reason": "五维边锋模型使用推进跑动与最高速度表达纵深能力，不再将冲刺距离误作防守指标。"},
        {"column": "Successful defensive actions per 90", "reason": "五维边锋能力模型不设置独立防守维度；防守表现不再由体能指标替代。"},
    ],
}


SCOUTING_MODELS: dict[str, dict[str, Any]] = {
    model["id"]: model for model in [INVERTED_RIGHT_WINGER_MODEL, *ADDITIONAL_SCOUTING_MODELS]
}


METRIC_ALIASES: dict[str, list[str]] = {
    "Goals per 90": ["Goals p90"],
    "xG per 90": ["Expected goals per 90", "xg p90"],
    "Non-penalty goals per 90": ["Non penalty goals per 90", "NPG per 90"],
    "Shots per 90": ["Shots p90"],
    "Touches in box per 90": ["Touches in penalty area per 90"],
    "Shots on target, %": ["Shots on target %"],
    "Goal conversion, %": ["Goal conversion %"],
    "Duels per 90": ["Duels p90"],
    "Duels won, %": ["Duels won %"],
    "Aerial duels per 90": ["Aerial duels p90"],
    "Aerial duels won, %": ["Aerial duels won %"],
    "Total Distance per 90": ["Total distance p90"],
    "High Intensity Distance per 90": ["HI Distance per 90 (+20 km/h)"],
    "Sprinting Distance per 90 (+25 km/h)": ["Sprinting distance p90", "Sprint distance p90"],
    "Meters per minute": ["Meter/Min"],
    "Max Speed (km/h)": ["Max speed", "Maximum speed (km/h)"],
    "Dribbles per 90": ["Dribbles p90"],
    "Successful dribbles, %": ["Successful dribbles %", "Dribble success, %"],
    "Offensive duels per 90": ["Attacking duels per 90"],
    "Offensive duels won, %": ["Attacking duels won, %"],
    "Progressive runs per 90": ["Progressive carries per 90"],
    "Successful attacking actions per 90": ["Successful offensive actions per 90"],
    "Accelerations per 90": ["Accelerations p90"],
    "xA per 90": ["Expected assists per 90", "xa p90"],
    "Key passes per 90": ["Key passes p90"],
    "Shot assists per 90": ["Shot assists p90"],
    "Passes to penalty area per 90": ["Passes into penalty area per 90"],
    "Through passes per 90": ["Through balls per 90"],
    "Crosses per 90": ["Crosses p90"],
    "Accurate crosses, %": ["Cross accuracy, %"],
    "Crosses to goalie box per 90": ["Crosses to six-yard box per 90"],
    "Deep completed crosses per 90": ["Deep completed crosses p90"],
    "Corners per 90": ["Corners p90"],
    "Free kicks per 90": ["Free kicks p90"],
    "Fouls suffered per 90": ["Fouls won per 90"],
    "Losses per 90": ["Possession losses per 90", "Ball losses per 90", "Lost balls per 90"],
    "Accurate passes, %": ["Pass accuracy, %"],
    "Successful defensive actions per 90": ["Successful defending actions per 90"],
    "PAdj Interceptions": ["Possession adjusted interceptions"],
    "Defensive duels won, %": ["Defensive duel success, %"],
    "Total actions per 90": ["Total actions p90", "Actions per 90"],
    "Total actions": ["Actions", "总行动数"],
}


FIELD_ALIASES: dict[str, list[str]] = {
    "position": ["Position", "Positions", "位置"],
    "foot": ["Foot", "Preferred foot", "惯用脚"],
    "minutes": ["Minutes played", "Minutes", "Mins played", "出场分钟"],
    "matches": ["Matches played", "Appearances", "Matches", "出场场次"],
    "team": ["Team within selected timeframe", "Team", "Club", "Squad", "球队"],
    "age": ["Age", "年龄"],
}


def _normalize_key(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().replace("_", " ").split())


def _to_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "").replace("%", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _column_lookup(columns: list[str]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for column in columns:
        key = _normalize_key(column)
        if key and key not in lookup:
            lookup[key] = column
    return lookup


def _resolve_column(lookup: dict[str, str], canonical: str, aliases: list[str] | None = None) -> str:
    for candidate in [canonical, *(aliases or [])]:
        matched = lookup.get(_normalize_key(candidate))
        if matched:
            return matched
    return ""


def _position_tokens(value: Any) -> set[str]:
    text = str(value or "").strip().upper()
    if not text:
        return set()
    return {token.strip() for token in re.split(r"[,;/|、]+", text) if token.strip()}


def _is_model_position(value: Any, model: dict[str, Any]) -> bool:
    tokens = _position_tokens(value)
    accepted = set(model["positionTokens"])
    if tokens & accepted:
        return True
    long_name_map = {
        "RWF": {"RIGHT WINGER", "RIGHT FORWARD", "右边锋"},
        "RW": {"RIGHT WINGER", "右边锋", "右前卫"},
        "RAMF": {"RIGHT ATTACKING MIDFIELDER", "右前腰", "右前卫"},
        "LWF": {"LEFT WINGER", "LEFT FORWARD", "左边锋"},
        "LW": {"LEFT WINGER", "左边锋", "左前卫"},
        "LAMF": {"LEFT ATTACKING MIDFIELDER", "左前腰", "左前卫"},
        "CF": {"CENTRE FORWARD", "CENTER FORWARD", "STRIKER", "中锋", "前锋"},
        "AMF": {"ATTACKING MIDFIELDER", "前腰"},
        "RCMF": {"RIGHT CENTRAL MIDFIELDER", "右中前卫"},
        "LCMF": {"LEFT CENTRAL MIDFIELDER", "左中前卫"},
        "CMF": {"CENTRAL MIDFIELDER", "CENTRE MIDFIELDER", "中前卫", "中场"},
        "DMF": {"DEFENSIVE MIDFIELDER", "后腰"},
        "CB": {"CENTRE BACK", "CENTER BACK", "中后卫", "中卫"},
        "RB": {"RIGHT BACK", "右后卫"},
        "LB": {"LEFT BACK", "左后卫"},
        "GK": {"GOALKEEPER", "门将"},
    }
    expanded = set().union(*(long_name_map.get(token, set()) for token in accepted))
    return bool(tokens & expanded)


def _foot_bucket(value: Any, position_value: Any, model: dict[str, Any]) -> str:
    mode = model.get("footMode", "none")
    if mode == "none":
        return "confirmed"
    text = _normalize_key(value)
    foot = "left" if text in {"left", "left foot", "左", "左脚"} else "right" if text in {"right", "right foot", "右", "右脚"} else ""
    if mode == "left_right_wing":
        if foot == "left":
            return "confirmed"
        if foot == "right":
            return "excluded"
        # "both" cannot prove that the player's preferred cutting foot is the left foot.
        return "pending"
    if mode == "inverted_wide":
        if not foot:
            return "pending"
        tokens = _position_tokens(position_value)
        right_side = {"RW", "RWF", "RAMF"}
        left_side = {"LW", "LWF", "LAMF"}
        if (foot == "left" and tokens & right_side) or (foot == "right" and tokens & left_side):
            return "confirmed"
        return "excluded"
    if mode == "natural_wide":
        if not foot:
            return "pending"
        tokens = _position_tokens(position_value)
        right_side = {"RW", "RWF", "RAMF"}
        left_side = {"LW", "LWF", "LAMF"}
        if (foot == "right" and tokens & right_side) or (foot == "left" and tokens & left_side):
            return "confirmed"
        return "excluded"
    return "confirmed"


def _iter_model_metrics(model: dict[str, Any]):
    for dimension in model["dimensions"]:
        for metric in dimension["metrics"]:
            yield dimension, metric


def _resolve_metric(lookup: dict[str, str], metric: dict[str, Any]) -> dict[str, Any]:
    derived = metric.get("derived") if isinstance(metric.get("derived"), dict) else None
    if derived:
        source_columns = [
            _resolve_column(lookup, source, METRIC_ALIASES.get(source, []))
            for source in derived.get("columns", [])
        ]
        operation = str(derived.get("operation") or "")
        separator = " ÷ " if operation == "ratio_percent" else " − "
        matched = separator.join(source_columns) if source_columns and all(source_columns) else ""
        return {"column": matched, "sourceColumns": source_columns, "derived": derived}
    canonical = metric["column"]
    column = _resolve_column(lookup, canonical, METRIC_ALIASES.get(canonical, []))
    if column:
        return {"column": column, "sourceColumns": [column], "derived": None}
    fallback_derived = metric.get("fallbackDerived") if isinstance(metric.get("fallbackDerived"), dict) else None
    if fallback_derived:
        source_columns = [
            _resolve_column(lookup, source, METRIC_ALIASES.get(source, []))
            for source in fallback_derived.get("columns", [])
        ]
        operation = str(fallback_derived.get("operation") or "")
        if operation == "volume_times_failure_rate" and len(source_columns) == 2 and all(source_columns):
            matched = f"{source_columns[0]} × (100 − {source_columns[1]}) ÷ 100"
        else:
            matched = ""
        return {
            "column": matched,
            "sourceColumns": source_columns,
            "derived": fallback_derived,
            "usedFallback": bool(matched),
        }
    return {"column": column, "sourceColumns": [column] if column else [], "derived": None}


def _metric_value(raw: dict[str, Any], resolved: dict[str, Any]) -> float | None:
    derived = resolved.get("derived")
    if not derived:
        return _to_float(raw.get(resolved["column"])) if resolved.get("column") else None
    values = [_to_float(raw.get(column)) if column else None for column in resolved.get("sourceColumns", [])]
    if not values or any(value is None for value in values):
        return None
    if derived.get("operation") == "subtract" and len(values) == 2:
        return float(values[0]) - float(values[1])
    if derived.get("operation") == "ratio_percent" and len(values) == 2:
        denominator = float(values[1])
        return float(values[0]) / denominator * 100.0 if denominator > 0 else None
    if derived.get("operation") == "volume_times_failure_rate" and len(values) == 2:
        volume = max(0.0, float(values[0]))
        success_rate = min(100.0, max(0.0, float(values[1])))
        return volume * (100.0 - success_rate) / 100.0
    return None


def _model_public_view(model: dict[str, Any], metric_resolution: dict[str, dict[str, Any]]) -> dict[str, Any]:
    dimensions = []
    for dimension in model["dimensions"]:
        metrics = []
        for metric in dimension["metrics"]:
            resolved = metric_resolution[metric["column"]]
            metrics.append(
                {
                    **metric,
                    "matchedColumn": resolved["column"],
                    "sourceColumns": resolved.get("sourceColumns", []),
                    "validCohortCount": resolved["validCount"],
                    "available": resolved["available"],
                    "smoothingAlpha": round(float(resolved["smoothingAlpha"]), 3),
                    "zeroShare": round(float(resolved["zeroShare"]), 3),
                    "zeroFloorPercentile": resolved["zeroFloorPercentile"],
                    "smoothingReason": resolved["smoothingReason"],
                    "percentileAlgorithm": resolved["percentileAlgorithm"],
                    "coupledGroupId": resolved.get("coupledGroupId", ""),
                    "coupledGroupLabel": resolved.get("coupledGroupLabel", ""),
                    "coupledFormula": resolved.get("coupledFormula", ""),
                }
            )
        dimensions.append({**dimension, "metrics": metrics})
    return {
        key: value
        for key, value in {**model, "dimensions": dimensions}.items()
        if key not in {"positionTokens", "requiredFoot"}
    } | {
        "positionTokens": list(model["positionTokens"]),
        "requiredFoot": model.get("requiredFoot", ""),
        "usesFootFilter": model.get("footMode", "none") != "none",
        "confirmedLabel": "逆足确认" if model.get("footMode") in {"left_right_wing", "inverted_wide"} else "顺足确认" if model.get("footMode") == "natural_wide" else "职责候选",
        "pendingLabel": "足侧待确认",
        "excludedLabel": "同侧顺足排除" if model.get("footMode") == "inverted_wide" else "右脚排除" if model.get("footMode") == "left_right_wing" else "逆足排除" if model.get("footMode") == "natural_wide" else "足侧排除",
    }


def list_scouting_models() -> list[dict[str, Any]]:
    family_order = {name: index for index, name in enumerate(["中锋", "边锋", "前腰", "中前卫", "后腰", "边后卫", "中卫", "门将"])}
    forward_role_order = {
        role_id: index
        for index, role_id in enumerate([
            "target_forward",
            "poacher",
            "power_forward",
            "playmaking_forward",
            "complete_forward",
        ])
    }

    def catalog_metrics(model: dict[str, Any], dimension: dict[str, Any]) -> list[dict[str, Any]]:
        metrics = dimension["metrics"]
        dimension_columns = {metric["column"] for metric in metrics}
        pair_by_column: dict[str, dict[str, Any]] = {}
        for spec in PAIR_SPECS:
            if spec["volume"] in dimension_columns and spec["rate"] in dimension_columns:
                pair_by_column[str(spec["volume"])] = spec
                pair_by_column[str(spec["rate"])] = spec
        return [
            {
                "column": metric["column"],
                "label": metric.get("label", ""),
                "note": metric.get("note", ""),
                "weight": metric["weight"],
                "direction": metric.get("direction", "higher"),
                "derived": metric.get("derived") or metric.get("fallbackDerived"),
                "coupledGroupId": pair_by_column.get(metric["column"], {}).get("id", ""),
                "coupledGroupLabel": (
                    f'{pair_by_column[metric["column"]]["label"]}（修正）'
                    if metric["column"] in pair_by_column
                    else ""
                ),
                "coupledFormula": PAIR_SCORE_FORMULA if metric["column"] in pair_by_column else "",
                "coupledBayesFormula": PAIR_BAYES_FORMULA if metric["column"] in pair_by_column else "",
            }
            for metric in metrics
        ]

    models = [
        {
            "id": model["id"],
            "version": model["version"],
            "name": model["name"],
            "family": model["family"],
            "qualityLevel": model["qualityLevel"],
            "description": model["description"],
            "positionTokens": list(model["positionTokens"]),
            "footMode": model.get("footMode", "none"),
            "usesFootFilter": model.get("footMode", "none") != "none",
            "dimensions": [
                {
                    "id": dimension["id"],
                    "name": dimension["name"],
                    "weight": dimension["weight"],
                    "metrics": catalog_metrics(model, dimension),
                }
                for dimension in model["dimensions"]
            ],
            "notScored": list(model.get("notScored", [])),
        }
        for model in SCOUTING_MODELS.values()
        if model.get("catalogVisible", True)
    ]
    return sorted(
        models,
        key=lambda item: (
            family_order.get(item["family"], 99),
            forward_role_order.get(item["id"], 99) if item["family"] == "中锋" else 0,
        ),
    )


def evaluate_scouting_role(
    doc: dict[str, Any],
    *,
    role_id: str = "inverted_right_winger_left_foot",
    early_season: bool = False,
    min_minutes: float = DEFAULT_MIN_MINUTES,
    min_avg_minutes: float = DEFAULT_MIN_AVG_MINUTES,
    reliability_minutes: float = DEFAULT_RELIABILITY_MINUTES,
    percentile_algorithm_by_column: dict[str, str] | None = None,
) -> dict[str, Any]:
    model = SCOUTING_MODELS.get(role_id)
    if model is None:
        return {"ok": False, "error": f"未知职责模型：{role_id}"}
    players = doc.get("players") if isinstance(doc.get("players"), list) else []
    schema = doc.get("schema") if isinstance(doc.get("schema"), dict) else {}
    all_columns = schema.get("allColumns") if isinstance(schema.get("allColumns"), list) else []
    if not all_columns and players:
        raw = players[0].get("raw") if isinstance(players[0], dict) else {}
        all_columns = list(raw.keys()) if isinstance(raw, dict) else []
    columns = [str(column) for column in all_columns if str(column).strip()]
    lookup = _column_lookup(columns)

    resolved_fields = {
        field: _resolve_column(lookup, aliases[0], aliases[1:]) for field, aliases in FIELD_ALIASES.items()
    }
    missing_required_fields = [field for field in ("position", "minutes", "matches") if not resolved_fields[field]]
    if missing_required_fields:
        return {
            "ok": False,
            "error": f"缺少职责筛选字段：{', '.join(missing_required_fields)}",
            "missingRequiredFields": missing_required_fields,
        }

    min_minutes = max(0.0, float(min_minutes))
    min_avg_minutes = max(0.0, float(min_avg_minutes))
    reliability_minutes = max(1.0, float(reliability_minutes))

    position_candidates: list[dict[str, Any]] = []
    sample_excluded = 0
    for player in players:
        if not isinstance(player, dict):
            continue
        raw = player.get("raw") if isinstance(player.get("raw"), dict) else {}
        position_value = raw.get(resolved_fields["position"])
        if not _is_model_position(position_value, model):
            continue
        minutes = _to_float(raw.get(resolved_fields["minutes"])) or 0.0
        matches = _to_float(raw.get(resolved_fields["matches"])) or 0.0
        avg_minutes = minutes / matches if matches > 0 else 0.0
        eligible_sample = early_season or (minutes >= min_minutes and avg_minutes >= min_avg_minutes)
        if not eligible_sample:
            sample_excluded += 1
            continue
        position_candidates.append(
            {
                "source": player,
                "raw": raw,
                "minutes": minutes,
                "matches": matches,
                "avgMinutes": avg_minutes,
                "positionValue": position_value,
                "footValue": raw.get(resolved_fields["foot"], "") if resolved_fields["foot"] else "",
                "footBucket": _foot_bucket(raw.get(resolved_fields["foot"]), position_value, model),
            }
        )

    is_forward_experiment = role_id in FORWARD_ROLE_IDS
    is_winger_experiment = role_id in WINGER_ROLE_IDS
    is_attacking_midfielder_experiment = role_id in ATTACKING_MIDFIELDER_ROLE_IDS
    is_central_midfielder_experiment = role_id in CENTRAL_MIDFIELDER_ROLE_IDS
    is_defensive_midfielder_experiment = role_id in DEFENSIVE_MIDFIELDER_ROLE_IDS
    analysis_canonicals: set[str] = {
        str(spec[key])
        for spec in PAIR_SPECS
        for key in ("volume", "rate")
    }
    if is_forward_experiment:
        for pillar in PILLAR_SPECS.values():
            analysis_canonicals.update(
                feature
                for feature in pillar["features"]
                if feature not in {"duel_share", "aerial_share", "shot_share", "dribble_share", "pass_share"}
            )
        analysis_canonicals.update({"Total actions per 90", "Total actions"})
    if is_winger_experiment:
        analysis_canonicals.update(WINGER_ANALYSIS_COLUMNS)
    if is_attacking_midfielder_experiment:
        analysis_canonicals.update(ATTACKING_MIDFIELDER_ANALYSIS_COLUMNS)
    if is_central_midfielder_experiment:
        analysis_canonicals.update(CENTRAL_MIDFIELDER_ANALYSIS_COLUMNS)
    if is_defensive_midfielder_experiment:
        analysis_canonicals.update(DEFENSIVE_MIDFIELDER_ANALYSIS_COLUMNS)
    analysis_columns = {
        canonical: _resolve_column(lookup, canonical, METRIC_ALIASES.get(canonical, []))
        for canonical in analysis_canonicals
    }
    model_metric_columns = {metric["column"] for _, metric in _iter_model_metrics(model)}
    pair_scores, pair_metadata = build_forward_pair_scores(
        position_candidates,
        model_metric_columns=model_metric_columns,
        columns=analysis_columns,
        to_float=_to_float,
    )
    pair_by_metric = {
        str(spec[key]): str(spec["id"])
        for spec in PAIR_SPECS
        if str(spec["id"]) in pair_metadata
        for key in ("volume", "rate")
    }
    forward_archetypes = build_forward_archetypes(
        position_candidates,
        columns=analysis_columns,
        to_float=_to_float,
        reliability_minutes=reliability_minutes,
    ) if is_forward_experiment else {}
    winger_archetypes = build_winger_archetypes(
        position_candidates,
        columns=analysis_columns,
        to_float=_to_float,
        reliability_minutes=reliability_minutes,
    ) if is_winger_experiment else {}
    attacking_midfielder_archetypes = build_attacking_midfielder_archetypes(
        position_candidates,
        columns=analysis_columns,
        to_float=_to_float,
        reliability_minutes=reliability_minutes,
    ) if is_attacking_midfielder_experiment else {}
    central_midfielder_archetypes = build_central_midfielder_archetypes(
        position_candidates,
        columns=analysis_columns,
        to_float=_to_float,
        reliability_minutes=reliability_minutes,
    ) if is_central_midfielder_experiment else {}
    defensive_midfielder_archetypes = build_defensive_midfielder_archetypes(
        position_candidates,
        columns=analysis_columns,
        to_float=_to_float,
        reliability_minutes=reliability_minutes,
    ) if is_defensive_midfielder_experiment else {}

    metric_resolution: dict[str, dict[str, Any]] = {}
    for _, metric in _iter_model_metrics(model):
        canonical = metric["column"]
        resolved_metric = _resolve_metric(lookup, metric)
        values = sorted(
            value
            for candidate in position_candidates
            if (value := _metric_value(candidate["raw"], resolved_metric)) is not None
        )
        smoothing = smoothing_profile(values)
        matched_column = str(resolved_metric.get("column") or "").strip()
        matched_key = _normalize_key(matched_column)
        algorithm_column = (
            matched_column
            if percentile_algorithm_by_column and matched_key in percentile_algorithm_by_column
            else canonical
        )
        percentile_algorithm = resolve_percentile_algorithm(algorithm_column, percentile_algorithm_by_column)
        algorithm_label = percentile_algorithm_label(percentile_algorithm)
        if percentile_algorithm == EVENT_POSITIVE:
            algorithm_reason = f"{algorithm_label}：零值按并列占比压缩到0-8分；正值按非零排名75%与对数强度25%评分；最大正值100，全体同值50"
        elif percentile_algorithm == EVENT_NEGATIVE:
            algorithm_reason = f"{algorithm_label}：先按稀疏事件正向评分再取100减分；最大事件值0，全体同值50"
        else:
            algorithm_reason = f"{algorithm_label}；{smoothing['reason']}"
        elite_raw_ceiling = max(
            (
                percentile_pair_for_algorithm(
                    values,
                    value,
                    algorithm=percentile_algorithm,
                    alpha=smoothing["alpha"],
                )["rawPercentile"]
                for value in values
            ),
            default=50.0,
        )
        metric_resolution[canonical] = {
            **resolved_metric,
            "values": values,
            "validCount": len(values),
            "available": bool(resolved_metric["column"]) and len(values) >= MIN_METRIC_COHORT and percentile_algorithm != EXCLUDE,
            "percentileAlgorithm": percentile_algorithm,
            "smoothingAlpha": smoothing["alpha"],
            "zeroShare": smoothing["zeroShare"],
            "zeroFloorPercentile": smoothing["zeroFloorPercentile"],
            "smoothingReason": algorithm_reason,
            "eliteRawCeiling": elite_raw_ceiling,
            "coupledGroupId": pair_by_metric.get(canonical, ""),
            "coupledGroupLabel": pair_metadata.get(pair_by_metric.get(canonical, ""), {}).get("label", ""),
            "coupledFormula": pair_metadata.get(pair_by_metric.get(canonical, ""), {}).get("formula", ""),
        }

    total_weight = sum(float(metric["weight"]) for _, metric in _iter_model_metrics(model))
    available_weight = sum(
        float(metric["weight"])
        for _, metric in _iter_model_metrics(model)
        if metric_resolution[metric["column"]]["available"]
    )
    model_coverage = available_weight / total_weight if total_weight else 0.0
    score_available = model_coverage >= 0.7 and len(position_candidates) >= MIN_METRIC_COHORT

    scored_players = []
    for candidate_index, candidate in enumerate(position_candidates):
        reliability = min(1.0, candidate["minutes"] / reliability_minutes)
        metric_rows = []
        dimension_rows = []
        base_weighted_score = 0.0
        weighted_score = 0.0
        valid_player_weight = 0.0
        for dimension in model["dimensions"]:
            dimension_weighted_score = 0.0
            dimension_valid_weight = 0.0
            for metric in dimension["metrics"]:
                weight = float(metric["weight"])
                resolved = metric_resolution[metric["column"]]
                raw_value = _metric_value(candidate["raw"], resolved)
                coupled_group_id = str(resolved.get("coupledGroupId") or "")
                coupled_result = pair_scores.get(candidate_index, {}).get(coupled_group_id) if coupled_group_id else None
                valid = bool(resolved["available"] and raw_value is not None and (not coupled_group_id or coupled_result is not None))
                percentiles = percentile_pair_for_algorithm(
                    resolved["values"],
                    raw_value,
                    algorithm=resolved["percentileAlgorithm"],
                    alpha=resolved["smoothingAlpha"],
                ) if valid else {"rawPercentile": 50.0, "adjustedPercentile": 50.0}
                raw_percentile = float(coupled_result["rawPercentile"]) if coupled_result else percentiles["rawPercentile"]
                percentile = float(coupled_result["score"]) if coupled_result else percentiles["adjustedPercentile"]
                elite_raw_ceiling = (
                    float(coupled_result["rawPercentileCeiling"])
                    if coupled_result
                    else float(resolved.get("eliteRawCeiling", 100.0))
                )
                elite_metric = elite_metric_score(
                    percentile,
                    raw_percentile,
                    elite_raw_ceiling,
                    valid,
                )
                scoring_percentile = float(elite_metric["score"])
                base_weighted_score += percentile * weight
                weighted_score += scoring_percentile * weight
                dimension_weighted_score += scoring_percentile * weight
                if valid:
                    valid_player_weight += weight
                    dimension_valid_weight += weight
                metric_rows.append(
                    {
                        "column": metric["column"],
                        "label": metric.get("label"),
                        "note": metric.get("note", ""),
                        "matchedColumn": resolved["column"],
                        "sourceColumns": resolved.get("sourceColumns", []),
                        "dimensionId": dimension["id"],
                        "dimensionName": dimension["name"],
                        "weight": weight,
                        "rawValue": raw_value,
                        "rawPercentile": raw_percentile,
                        "percentile": percentile,
                        "scoringPercentile": scoring_percentile,
                        "eliteMetricBonus": float(elite_metric["bonus"]),
                        "eliteEligible": bool(elite_metric["eligible"]),
                        "eliteRawCeiling": elite_raw_ceiling,
                        "smoothingAlpha": round(float(resolved["smoothingAlpha"]), 3),
                        "zeroShare": round(float(resolved["zeroShare"]), 3),
                        "zeroFloorPercentile": resolved["zeroFloorPercentile"],
                        "smoothingReason": resolved["smoothingReason"],
                        "percentileAlgorithm": resolved["percentileAlgorithm"],
                        "coupledGroupId": coupled_group_id,
                        "coupledGroupLabel": resolved.get("coupledGroupLabel", ""),
                        "coupledFormula": resolved.get("coupledFormula", ""),
                        "coupledComponents": coupled_result or None,
                        "available": valid,
                        "rawContribution": weight / total_weight * (scoring_percentile - 50.0) if total_weight else 0.0,
                        "contribution": reliability * weight / total_weight * (scoring_percentile - 50.0) if total_weight else 0.0,
                    }
                )
            dimension_rows.append(
                {
                    "id": dimension["id"],
                    "name": dimension["name"],
                    "weight": dimension["weight"],
                    "score": round(dimension_weighted_score / float(dimension["weight"]), 1),
                    "completeness": round(dimension_valid_weight / float(dimension["weight"]), 3),
                }
            )

        base_score = base_weighted_score / total_weight if total_weight else 50.0
        raw_score = weighted_score / total_weight if total_weight else 50.0
        adjusted_score = 50.0 + reliability * (raw_score - 50.0)
        source = candidate["source"]
        raw = candidate["raw"]
        archetype = (
            forward_archetypes.get(candidate_index)
            if is_forward_experiment
            else winger_archetypes.get(candidate_index)
            if is_winger_experiment
            else attacking_midfielder_archetypes.get(candidate_index)
            if is_attacking_midfielder_experiment
            else central_midfielder_archetypes.get(candidate_index)
            if is_central_midfielder_experiment
            else defensive_midfielder_archetypes.get(candidate_index)
            if is_defensive_midfielder_experiment
            else None
        )
        current_role_result = next(
            (item for item in (archetype or {}).get("fits", []) if item.get("roleId") == role_id),
            None,
        )
        current_role_fit = float(current_role_result["score"]) if current_role_result else None
        strongest = sorted((row for row in metric_rows if row["available"]), key=lambda row: row["contribution"], reverse=True)[:3]
        weakest = sorted((row for row in metric_rows if row["available"]), key=lambda row: row["contribution"])[:3]
        scored_players.append(
            {
                "id": source.get("id"),
                "player": source.get("player"),
                "team": raw.get(resolved_fields["team"], "") if resolved_fields["team"] else "",
                "age": raw.get(resolved_fields["age"], "") if resolved_fields["age"] else "",
                "position": raw.get(resolved_fields["position"], ""),
                "foot": raw.get(resolved_fields["foot"], ""),
                "minutes": round(candidate["minutes"], 1),
                "matches": round(candidate["matches"], 1),
                "avgMinutes": round(candidate["avgMinutes"], 1),
                "footStatus": candidate["footBucket"],
                "baseScore": round(base_score, 1),
                "baseScoreExact": base_score,
                "rawScore": round(raw_score, 1),
                "score": round(adjusted_score, 1),
                "rawScoreExact": raw_score,
                "scoreExact": adjusted_score,
                "reliability": round(reliability, 3),
                "completeness": round(valid_player_weight / total_weight, 3) if total_weight else 0.0,
                "dimensions": dimension_rows,
                "metrics": metric_rows,
                "strengths": [row["column"] for row in strongest if row["contribution"] > 0],
                "risks": [row["column"] for row in weakest if row["contribution"] < 0],
                "roleFitScore": None if current_role_fit is None else round(current_role_fit, 1),
                "roleFitProbability": None if current_role_fit is None else round(current_role_fit / 100.0, 4),
                "archetype": archetype,
            }
        )

    confirmed = sorted((item for item in scored_players if item["footStatus"] == "confirmed"), key=lambda item: (-item["score"], -item["rawScore"], str(item["player"])))
    pending = sorted((item for item in scored_players if item["footStatus"] == "pending"), key=lambda item: (-item["score"], -item["rawScore"], str(item["player"])))
    for index, item in enumerate(confirmed, start=1):
        item["rank"] = index
    for index, item in enumerate(pending, start=1):
        item["rank"] = index

    return {
        "ok": True,
        "model": _model_public_view(model, metric_resolution),
        "source": doc.get("source", {}),
        "settings": {
            "earlySeason": bool(early_season),
            "minMinutes": min_minutes,
            "minAvgMinutes": min_avg_minutes,
            "reliabilityMinutes": reliability_minutes,
            "minMetricCohort": MIN_METRIC_COHORT,
            "percentileMode": "project_mapping_algorithm",
            "contributionMode": "selected_weight_closed_loop",
            "forwardExperimentEnabled": is_forward_experiment,
            "wingerExperimentEnabled": is_winger_experiment,
            "attackingMidfielderExperimentEnabled": is_attacking_midfielder_experiment,
            "centralMidfielderExperimentEnabled": is_central_midfielder_experiment,
            "defensiveMidfielderExperimentEnabled": is_defensive_midfielder_experiment,
            "roleSimilarityEnabled": is_forward_experiment or is_winger_experiment or is_attacking_midfielder_experiment or is_central_midfielder_experiment or is_defensive_midfielder_experiment,
            "coupledMetricMode": "bayesian_volume_efficiency_v1" if pair_metadata else "off",
            "eliteThreshold": ELITE_THRESHOLD,
            "eliteMode": "per_metric_linear_top_decile_v2",
            "eliteMaxPoints": ELITE_MAX_POINTS,
            "reliabilityBaseline": 50.0,
            "archetypeProbabilityMode": "independent_similarity_not_normalized_v8" if is_forward_experiment or is_winger_experiment or is_attacking_midfielder_experiment or is_central_midfielder_experiment or is_defensive_midfielder_experiment else "off",
            "archetypeSoftmaxTemperature": None,
            "archetypeLabelMode": "sparse_exclusive_labels_v8" if is_forward_experiment or is_winger_experiment or is_attacking_midfielder_experiment or is_central_midfielder_experiment or is_defensive_midfielder_experiment else "off",
        },
        "summary": {
            "datasetPlayerCount": len(players),
            "comparisonCohortCount": len(position_candidates),
            "confirmedCount": len(confirmed),
            "pendingCount": len(pending),
            "footExcludedCount": sum(1 for item in scored_players if item["footStatus"] == "excluded"),
            "rightFootExcludedCount": sum(1 for item in scored_players if item["footStatus"] == "excluded"),
            "sampleExcludedCount": sample_excluded,
            "modelCoverage": round(model_coverage, 3),
            "scoreAvailable": score_available,
            "qualityLevel": model["qualityLevel"],
            "forwardExperimentEnabled": is_forward_experiment,
            "wingerExperimentEnabled": is_winger_experiment,
            "attackingMidfielderExperimentEnabled": is_attacking_midfielder_experiment,
            "centralMidfielderExperimentEnabled": is_central_midfielder_experiment,
            "defensiveMidfielderExperimentEnabled": is_defensive_midfielder_experiment,
            "roleSimilarityEnabled": is_forward_experiment or is_winger_experiment or is_attacking_midfielder_experiment or is_central_midfielder_experiment or is_defensive_midfielder_experiment,
            "coupledGroupCount": len(pair_metadata),
            "archetypeAvailable": bool(forward_archetypes or winger_archetypes or attacking_midfielder_archetypes or central_midfielder_archetypes or defensive_midfielder_archetypes),
        },
        "confirmed": confirmed,
        "pending": pending,
    }


def evaluate_inverted_right_winger(
    doc: dict[str, Any],
    *,
    early_season: bool = False,
    min_minutes: float = DEFAULT_MIN_MINUTES,
    min_avg_minutes: float = DEFAULT_MIN_AVG_MINUTES,
    reliability_minutes: float = DEFAULT_RELIABILITY_MINUTES,
) -> dict[str, Any]:
    return evaluate_scouting_role(
        doc,
        role_id="inverted_right_winger_left_foot",
        early_season=early_season,
        min_minutes=min_minutes,
        min_avg_minutes=min_avg_minutes,
        reliability_minutes=reliability_minutes,
    )
