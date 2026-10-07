from __future__ import annotations

import re
from math import sqrt
from typing import Any, Callable

from server_core.services.percentile_algorithm import EVENT_POSITIVE
from server_core.services.percentile_service import percentile_pair, percentile_pair_for_algorithm


WINGER_ROLE_IDS = {
    "inverted_right_winger_left_foot",
    "traditional_touchline_winger",
    "dribbling_winger",
    "winger_wide_playmaker",
}
MIN_ANALYSIS_COHORT = 8
ROLE_ASSIGNMENT_FLOOR = 45.0
ROLE_CLEAR_SCORE = 60.0
ROLE_CLEAR_GAP = 5.0
DUAL_ROLE_HIGH_SCORE = 70.0
DUAL_ROLE_HIGH_MAX_GAP = 3.0
DUAL_ROLE_SOLID_SCORE = 65.0
DUAL_ROLE_SOLID_MAX_GAP = 2.0


WINGER_ROLE_NAMES = {
    "inverted_right_winger_left_foot": "逆足内切型边锋",
    "traditional_touchline_winger": "顺足下底边锋",
    "dribbling_winger": "内锋",
    "winger_wide_playmaker": "组织型边锋",
}


# Each role reads only its defining evidence.  The geometric core prevents one
# excellent but unrelated pillar from compensating for a missing defining
# behaviour.  The four scores remain independent and do not sum to one.
TOUCHLINE_EVIDENCE_WEIGHTS = {"cross_carry_core": 0.65, "depth": 0.25, "work": 0.10}
INVERTED_EVIDENCE_WEIGHTS = {"carry_inside_core": 0.60, "creation": 0.25, "depth": 0.15}
INSIDE_FORWARD_EVIDENCE_WEIGHTS = {"box_depth_core": 0.65, "carrying": 0.25, "work": 0.10}
PLAYMAKER_EVIDENCE_WEIGHTS = {"creation_link_core": 0.65, "carrying": 0.20, "set_piece": 0.15}


EVENT_COLUMNS = {
    "crosses": "Crosses per 90",
    "goalie_box_crosses": "Crosses to goalie box per 90",
    "dribbles": "Dribbles per 90",
    "offensive_duels": "Offensive duels per 90",
    "progressive_runs": "Progressive runs per 90",
    "fouls_suffered": "Fouls suffered per 90",
    "shots": "Shots per 90",
    "box_touches": "Touches in box per 90",
    "accelerations": "Accelerations per 90",
    "key_passes": "Key passes per 90",
    "shot_assists": "Shot assists per 90",
    "penalty_area_passes": "Passes to penalty area per 90",
    "smart_passes": "Smart passes per 90",
    "through_passes": "Through passes per 90",
    "passes": "Passes per 90",
    "received_passes": "Received passes per 90",
    "long_passes": "Long passes per 90",
    "progressive_passes": "Progressive passes per 90",
    "final_third_passes": "Passes to final third per 90",
    "defensive_duels": "Defensive duels per 90",
    "successful_defensive_actions": "Successful defensive actions per 90",
}


WINGER_ANALYSIS_COLUMNS = {
    *EVENT_COLUMNS.values(),
    "Duels per 90",
    "Forward passes per 90",
    "Sprinting Distance per 90 (+25 km/h)",
    "Max Speed (km/h)",
    "Total Distance per 90",
    "Corners per 90",
    "Free kicks per 90",
    "Crosses from left flank per 90",
    "Crosses from right flank per 90",
    "Total actions per 90",
    "Total actions",
}


WINGER_PILLAR_SPECS: dict[str, dict[str, Any]] = {
    "crossing": {
        "name": "边路传中",
        "features": {"event:crosses": 0.70, "event:goalie_box_crosses": 0.30},
    },
    "carrying": {
        "name": "持球突破",
        "features": {
            "event:dribbles": 0.40,
            "event:progressive_runs": 0.30,
            "event:offensive_duels": 0.20,
            "event:fouls_suffered": 0.10,
        },
    },
    "box_threat": {
        "name": "禁区威胁",
        "features": {"event:box_touches": 0.55, "event:shots": 0.45},
    },
    "depth": {
        "name": "纵深冲击",
        "features": {
            "event:progressive_runs": 0.20,
            "event:accelerations": 0.30,
            "direct:Sprinting Distance per 90 (+25 km/h)": 0.30,
            "direct:Max Speed (km/h)": 0.20,
        },
    },
    "creation": {
        "name": "机会创造",
        "features": {
            "event:key_passes": 0.30,
            "event:shot_assists": 0.25,
            "event:penalty_area_passes": 0.20,
            "event:smart_passes": 0.15,
            "event:through_passes": 0.10,
        },
    },
    "link": {
        "name": "连接参与",
        "features": {
            "event:passes": 0.10,
            "event:received_passes": 0.10,
            "event:long_passes": 0.18,
            "event:progressive_passes": 0.25,
            "event:final_third_passes": 0.22,
            "direct:forward_pass_share": 0.15,
        },
    },
    "work": {
        "name": "跑动防守",
        "features": {
            "event:defensive_duels": 0.40,
            "event:successful_defensive_actions": 0.35,
            "direct:Total Distance per 90": 0.25,
        },
    },
    "set_piece": {
        "name": "定位球参与",
        "features": {"sparse:Corners per 90": 0.55, "sparse:Free kicks per 90": 0.45},
    },
}


def _metric(
    raw: dict[str, Any],
    canonical: str,
    columns: dict[str, str],
    to_float: Callable[[Any], float | None],
) -> float | None:
    column = columns.get(canonical, "")
    return to_float(raw.get(column)) if column else None


def _percentile_feature(values: dict[int, float], *, sparse: bool = False) -> dict[int, float]:
    if len(values) < MIN_ANALYSIS_COHORT:
        return {}
    sorted_values = sorted(values.values())
    if sparse:
        return {
            index: percentile_pair_for_algorithm(
                sorted_values,
                value,
                algorithm=EVENT_POSITIVE,
                alpha=0.0,
            )["adjustedPercentile"] / 100.0
            for index, value in values.items()
        }
    return {
        index: percentile_pair(sorted_values, value, alpha=0.0)["rawPercentile"] / 100.0
        for index, value in values.items()
    }


def _mean_available(*values: float | None) -> float | None:
    available = [float(value) for value in values if value is not None]
    return sum(available) / len(available) if available else None


def _weighted_evidence(components: list[tuple[str, float | None, float]]) -> dict[str, Any]:
    available = [(name, value, weight) for name, value, weight in components if value is not None]
    available_weight = sum(weight for _, _, weight in available)
    total_weight = sum(weight for _, _, weight in components)
    score = sum(float(value) * weight for _, value, weight in available) / available_weight if available_weight else None
    return {
        "score": score,
        "baseScore": score,
        "coreScore": components[0][1] if components and components[0][0].endswith("_core") else None,
        "coverage": available_weight / total_weight if total_weight else 0.0,
        "components": [
            {"id": name, "value": value, "weight": weight, "available": value is not None}
            for name, value, weight in components
        ],
    }


def _winger_role_evidence(pillar_values: dict[str, float]) -> dict[str, dict[str, Any]]:
    crossing = pillar_values.get("crossing")
    carrying = pillar_values.get("carrying")
    threat = pillar_values.get("box_threat")
    depth = pillar_values.get("depth")
    creation = pillar_values.get("creation")
    link = pillar_values.get("link")
    set_piece = pillar_values.get("set_piece")

    cross_carry_core = sqrt(max(0.0, crossing * carrying)) if crossing is not None and carrying is not None else None
    inside_support = _mean_available(threat, creation)
    carry_inside_core = (
        sqrt(max(0.0, carrying * inside_support))
        if carrying is not None and inside_support is not None
        else None
    )
    box_depth_core = sqrt(max(0.0, threat * depth)) if threat is not None and depth is not None else None
    creation_link_core = sqrt(max(0.0, creation * link)) if creation is not None and link is not None else None

    return {
        "traditional_touchline_winger": _weighted_evidence([
            ("cross_carry_core", cross_carry_core, TOUCHLINE_EVIDENCE_WEIGHTS["cross_carry_core"]),
            ("depth", depth, TOUCHLINE_EVIDENCE_WEIGHTS["depth"]),
            ("work", pillar_values.get("work"), TOUCHLINE_EVIDENCE_WEIGHTS["work"]),
        ]),
        "inverted_right_winger_left_foot": _weighted_evidence([
            ("carry_inside_core", carry_inside_core, INVERTED_EVIDENCE_WEIGHTS["carry_inside_core"]),
            ("creation", creation, INVERTED_EVIDENCE_WEIGHTS["creation"]),
            ("depth", depth, INVERTED_EVIDENCE_WEIGHTS["depth"]),
        ]),
        "dribbling_winger": _weighted_evidence([
            ("box_depth_core", box_depth_core, INSIDE_FORWARD_EVIDENCE_WEIGHTS["box_depth_core"]),
            ("carrying", carrying, INSIDE_FORWARD_EVIDENCE_WEIGHTS["carrying"]),
            ("work", pillar_values.get("work"), INSIDE_FORWARD_EVIDENCE_WEIGHTS["work"]),
        ]),
        "winger_wide_playmaker": _weighted_evidence([
            ("creation_link_core", creation_link_core, PLAYMAKER_EVIDENCE_WEIGHTS["creation_link_core"]),
            ("carrying", carrying, PLAYMAKER_EVIDENCE_WEIGHTS["carrying"]),
            ("set_piece", set_piece, PLAYMAKER_EVIDENCE_WEIGHTS["set_piece"]),
        ]),
    }


def _position_tokens(value: Any) -> list[str]:
    return [token.strip().upper() for token in re.split(r"[,;/|、]+", str(value or "")) if token.strip()]


def _foot(value: Any) -> str:
    text = " ".join(str(value or "").strip().lower().replace("_", " ").split())
    if text in {"left", "left foot", "左", "左脚"}:
        return "left"
    if text in {"right", "right foot", "右", "右脚"}:
        return "right"
    return ""


def _winger_position_context(
    candidate: dict[str, Any],
    *,
    columns: dict[str, str],
    to_float: Callable[[Any], float | None],
) -> dict[str, Any]:
    tokens = _position_tokens(candidate.get("positionValue"))
    right_tokens = {"RW", "RWF", "RAMF"}
    left_tokens = {"LW", "LWF", "LAMF"}
    has_right = bool(set(tokens) & right_tokens)
    has_left = bool(set(tokens) & left_tokens)
    side_tokens = right_tokens | left_tokens
    side_ranks = [index + 1 for index, token in enumerate(tokens) if token in side_tokens]
    first_rank = min(side_ranks) if side_ranks else 0
    rank_reliability = 1.0 if first_rank == 1 else 0.75 if first_rank == 2 else 0.55 if first_rank > 2 else 0.0

    left_rate = _metric(candidate["raw"], "Crosses from left flank per 90", columns, to_float)
    right_rate = _metric(candidate["raw"], "Crosses from right flank per 90", columns, to_float)
    minutes_factor = max(0.0, float(candidate.get("minutes") or 0.0)) / 90.0
    left_count = max(0.0, float(left_rate) * minutes_factor) if left_rate is not None else 0.0
    right_count = max(0.0, float(right_rate) * minutes_factor) if right_rate is not None else 0.0
    cross_count = left_count + right_count
    right_cross_share = (right_count + 1.0) / (cross_count + 2.0)
    cross_reliability = min(1.0, cross_count / 8.0)

    if has_right and not has_left:
        position_right = 1.0
        combined_right = 0.70 * position_right + 0.30 * right_cross_share
    elif has_left and not has_right:
        position_right = 0.0
        combined_right = 0.70 * position_right + 0.30 * right_cross_share
    else:
        combined_right = right_cross_share

    side = "right" if combined_right >= 0.65 else "left" if combined_right <= 0.35 else "mixed"
    side_label = "主要右侧活动" if side == "right" else "主要左侧活动" if side == "left" else "左右活动侧暂不明确"
    if cross_count > 0:
        cross_label = f"左路传中{left_count:.1f}次、右路传中{right_count:.1f}次"
    else:
        cross_label = "左右路传中样本不足"
    reliability = rank_reliability * (0.70 + 0.30 * cross_reliability)
    if side == "mixed":
        reliability *= 0.75
    return {
        "side": side,
        "sideLabel": side_label,
        "label": f"{side_label}；{cross_label}",
        "reliability": reliability,
        "positionRank": first_rank,
        "leftCrossShare": 1.0 - right_cross_share,
        "rightCrossShare": right_cross_share,
        "crossSampleReliability": cross_reliability,
    }


def _role_foot_status(role_id: str, side: str, foot: str) -> str:
    if role_id not in {"traditional_touchline_winger", "inverted_right_winger_left_foot"}:
        return "confirmed"
    if side not in {"left", "right"} or not foot:
        return "pending"
    natural = (side == "left" and foot == "left") or (side == "right" and foot == "right")
    if role_id == "traditional_touchline_winger":
        return "confirmed" if natural else "excluded"
    return "excluded" if natural else "confirmed"


def build_winger_archetypes(
    candidates: list[dict[str, Any]],
    *,
    columns: dict[str, str],
    to_float: Callable[[Any], float | None],
    reliability_minutes: float,
) -> dict[int, dict[str, Any]]:
    raw_features: dict[str, dict[int, float]] = {}
    denominator_modes: dict[int, str] = {}
    total_actions_column = columns.get("Total actions per 90", "")
    total_actions_count_column = columns.get("Total actions", "")

    for index, candidate in enumerate(candidates):
        raw = candidate["raw"]
        event_values = {
            event_id: _metric(raw, canonical, columns, to_float)
            for event_id, canonical in EVENT_COLUMNS.items()
        }
        duels = _metric(raw, "Duels per 90", columns, to_float)
        passes = event_values.get("passes")
        shots = event_values.get("shots")
        dribbles = event_values.get("dribbles")
        provided_total = to_float(raw.get(total_actions_column)) if total_actions_column else None
        provided_total_count = to_float(raw.get(total_actions_count_column)) if total_actions_count_column else None
        proxy_parts = [value for value in (duels, passes, shots, dribbles) if value is not None and value >= 0]
        if provided_total is not None and provided_total > 0:
            denominator = provided_total
            denominator_modes[index] = "源表每90分钟总行动"
        elif provided_total_count is not None and provided_total_count > 0 and float(candidate["minutes"]) > 0:
            denominator = provided_total_count * 90.0 / float(candidate["minutes"])
            denominator_modes[index] = "源表总行动按分钟换算"
        elif len(proxy_parts) >= 2 and sum(proxy_parts) > 0:
            denominator = sum(proxy_parts)
            denominator_modes[index] = "传球、对抗、盘带和射门代理总行动"
        else:
            denominator = None
            denominator_modes[index] = "行为量不足"

        for event_id, value in event_values.items():
            if value is None:
                continue
            raw_features.setdefault(f"volume:{event_id}", {})[index] = value
            if denominator and denominator > 0:
                raw_features.setdefault(f"share:{event_id}", {})[index] = max(0.0, value / denominator)

        for canonical in (
            "Sprinting Distance per 90 (+25 km/h)",
            "Max Speed (km/h)",
            "Total Distance per 90",
        ):
            value = _metric(raw, canonical, columns, to_float)
            if value is not None:
                raw_features.setdefault(f"direct:{canonical}", {})[index] = value

        forward_passes = _metric(raw, "Forward passes per 90", columns, to_float)
        if forward_passes is not None and passes is not None and passes > 0:
            raw_features.setdefault("direct:forward_pass_share", {})[index] = max(0.0, forward_passes / passes)

        for canonical in ("Corners per 90", "Free kicks per 90"):
            value = _metric(raw, canonical, columns, to_float)
            if value is not None:
                raw_features.setdefault(f"sparse:{canonical}", {})[index] = value

    feature_percentiles = {
        feature: _percentile_feature(values, sparse=feature.startswith("sparse:"))
        for feature, values in raw_features.items()
    }

    event_scores: dict[str, dict[int, float]] = {}
    event_coverages: dict[str, dict[int, float]] = {}
    for event_id in EVENT_COLUMNS:
        share_scores = feature_percentiles.get(f"share:{event_id}", {})
        volume_scores = feature_percentiles.get(f"volume:{event_id}", {})
        for index in range(len(candidates)):
            components = []
            if index in share_scores:
                components.append((share_scores[index], 0.70))
            if index in volume_scores:
                components.append((volume_scores[index], 0.30))
            available_weight = sum(weight for _, weight in components)
            if available_weight <= 0:
                continue
            event_scores.setdefault(event_id, {})[index] = sum(value * weight for value, weight in components) / available_weight
            event_coverages.setdefault(event_id, {})[index] = available_weight

    results: dict[int, dict[str, Any]] = {}
    for index, candidate in enumerate(candidates):
        pillar_rows: list[dict[str, Any]] = []
        pillar_values: dict[str, float] = {}
        pillar_coverage_sum = 0.0
        for pillar_id, pillar in WINGER_PILLAR_SPECS.items():
            weighted = 0.0
            available_weight = 0.0
            coverage_weight = 0.0
            for feature, weight in pillar["features"].items():
                if feature.startswith("event:"):
                    event_id = feature.split(":", 1)[1]
                    percentile = event_scores.get(event_id, {}).get(index)
                    feature_coverage = event_coverages.get(event_id, {}).get(index, 0.0)
                else:
                    percentile = feature_percentiles.get(feature, {}).get(index)
                    feature_coverage = 1.0 if percentile is not None else 0.0
                if percentile is None:
                    continue
                weighted += float(weight) * percentile
                available_weight += float(weight)
                coverage_weight += float(weight) * feature_coverage
            score = weighted / available_weight if available_weight > 0 else None
            coverage = coverage_weight / sum(float(weight) for weight in pillar["features"].values())
            pillar_coverage_sum += coverage
            if score is not None:
                pillar_values[pillar_id] = score
            pillar_rows.append({
                "id": pillar_id,
                "name": pillar["name"],
                "score": None if score is None else score * 100.0,
                "coverage": coverage,
            })

        coverage = pillar_coverage_sum / len(WINGER_PILLAR_SPECS)
        context = _winger_position_context(candidate, columns=columns, to_float=to_float)
        foot = _foot(candidate.get("footValue"))
        fits: list[dict[str, Any]] = []
        if len(pillar_values) >= 4:
            evidence_by_role = _winger_role_evidence(pillar_values)
            for role_id, name in WINGER_ROLE_NAMES.items():
                evidence = evidence_by_role[role_id]
                evidence_score = evidence["score"]
                foot_status = _role_foot_status(role_id, context["side"], foot)
                eligible = evidence_score is not None and float(evidence["coverage"]) >= 0.50 and foot_status != "excluded"
                score = 100.0 * float(evidence_score) if evidence_score is not None else 0.0
                fits.append({
                    "roleId": role_id,
                    "name": name,
                    "score": score,
                    "similarity": score,
                    "probability": score / 100.0 if eligible else 0.0,
                    "distance": 1.0 - float(evidence_score) if evidence_score is not None else 1.0,
                    "baseScore": 100.0 * float(evidence.get("baseScore") or 0.0),
                    "baseDistance": 1.0 - float(evidence.get("baseScore") or 0.0),
                    "distanceAdjustment": 0.0,
                    "adjustmentReason": "职责专属核心与辅助证据公式",
                    "evidenceScore": evidence_score,
                    "evidenceCoverage": evidence["coverage"],
                    "evidenceComponents": evidence["components"],
                    "coreScore": None if evidence.get("coreScore") is None else 100.0 * float(evidence["coreScore"]),
                    "eligible": eligible,
                    "footStatus": foot_status,
                    "eligibilityReason": "" if eligible else (
                        "惯用脚与主要活动侧不符合该职责"
                        if foot_status == "excluded"
                        else "职责相似度字段覆盖不足"
                    ),
                })

        fits.sort(key=lambda item: (not bool(item["eligible"]), -float(item["score"]), str(item["name"])))
        eligible_fits = [item for item in fits if item["eligible"]]
        primary = eligible_fits[0] if eligible_fits else None
        secondary = eligible_fits[1] if len(eligible_fits) > 1 else None
        margin = abs(float(primary["score"] - secondary["score"])) if primary and secondary else 0.0
        if primary is None:
            label = "数据不足"
            status = "insufficient"
        elif float(primary["score"]) < ROLE_ASSIGNMENT_FLOOR:
            label = "职责特征不突出"
            status = "uncertain"
        elif primary.get("footStatus") == "pending":
            label = str(primary["name"])
            status = "uncertain"
        elif secondary and float(primary["score"]) >= DUAL_ROLE_HIGH_SCORE and float(secondary["score"]) >= DUAL_ROLE_HIGH_SCORE and margin <= DUAL_ROLE_HIGH_MAX_GAP:
            label = f"{primary['name']} / {secondary['name']}复合型"
            status = "uncertain"
        elif secondary and float(primary["score"]) >= DUAL_ROLE_SOLID_SCORE and float(secondary["score"]) >= DUAL_ROLE_SOLID_SCORE and margin <= DUAL_ROLE_SOLID_MAX_GAP:
            label = f"{primary['name']} / {secondary['name']}复合型"
            status = "uncertain"
        else:
            label = str(primary["name"])
            status = "clear" if float(primary["score"]) >= ROLE_CLEAR_SCORE and margin >= ROLE_CLEAR_GAP else "leaning"

        minute_reliability = min(1.0, float(candidate["minutes"]) / max(1.0, reliability_minutes))
        role_clarity = min(1.0, margin / 20.0) if primary and secondary else 0.0
        foot_reliability = 0.75 if primary and primary.get("footStatus") == "pending" else 1.0
        data_confidence = coverage * minute_reliability * float(context["reliability"]) * foot_reliability
        relative_separation = (
            max(0.0, min(1.0, margin / max(1.0, float(primary["score"]))))
            if primary and secondary
            else 0.0
        )
        results[index] = {
            "enabled": True,
            "kind": "winger",
            "label": label,
            "status": status,
            "primaryRoleId": primary["roleId"] if primary else "",
            "primaryName": primary["name"] if primary else "",
            "secondaryRoleId": secondary["roleId"] if secondary else "",
            "secondaryName": secondary["name"] if secondary else "",
            "margin": margin,
            "probabilityGap": margin / 100.0,
            "relativeSeparation": relative_separation,
            "decisionStrength": role_clarity,
            "roleClarity": role_clarity,
            "dataConfidence": data_confidence,
            "confidence": data_confidence,
            "coverage": coverage,
            "minuteReliability": minute_reliability,
            "positionReliability": context["reliability"] * foot_reliability,
            "positionContext": context["label"],
            "denominatorMode": denominator_modes.get(index, "行为量不足"),
            "activitySide": context["sideLabel"],
            "leftCrossShare": context["leftCrossShare"],
            "rightCrossShare": context["rightCrossShare"],
            "crossSampleReliability": context["crossSampleReliability"],
            "fits": fits,
            "pillars": pillar_rows,
        }
    return results
