from __future__ import annotations

import re
from math import sqrt
from typing import Any, Callable

from server_core.services.percentile_service import percentile_pair


CENTRAL_MIDFIELDER_ROLE_IDS = {
    "box_to_box_midfielder",
    "progressive_number_eight",
    "central_playmaker",
}
MIN_ANALYSIS_COHORT = 8
ROLE_ASSIGNMENT_FLOOR = 45.0
ROLE_CLEAR_SCORE = 60.0
ROLE_CLEAR_GAP = 5.0
DUAL_ROLE_HIGH_SCORE = 70.0
DUAL_ROLE_HIGH_MAX_GAP = 3.0
DUAL_ROLE_SOLID_SCORE = 65.0
DUAL_ROLE_SOLID_MAX_GAP = 2.0


CENTRAL_MIDFIELDER_ROLE_NAMES = {
    "box_to_box_midfielder": "全场覆盖型（B2B）中场",
    "progressive_number_eight": "推进型中场",
    "central_playmaker": "组织核心",
}


B2B_EVIDENCE_WEIGHTS = {
    "coverage_two_way_core": 0.55,
    "carrying": 0.20,
    "passing_progression": 0.15,
    "physical": 0.10,
}
PROGRESSIVE_EVIDENCE_WEIGHTS = {
    "carry_pass_core": 0.65,
    "link": 0.15,
    "creation": 0.10,
    "box_arrival": 0.10,
}
PLAYMAKER_EVIDENCE_WEIGHTS = {
    "link_pass_core": 0.60,
    "creation": 0.25,
    "carrying": 0.10,
    "coverage": 0.05,
}


EVENT_COLUMNS = {
    "duels": "Duels per 90",
    "aerial_duels": "Aerial duels per 90",
    "offensive_duels": "Offensive duels per 90",
    "fouls_suffered": "Fouls suffered per 90",
    "defensive_duels": "Defensive duels per 90",
    "successful_defensive_actions": "Successful defensive actions per 90",
    "shots_blocked": "Shots blocked per 90",
    "dribbles": "Dribbles per 90",
    "progressive_runs": "Progressive runs per 90",
    "passes": "Passes per 90",
    "received_passes": "Received passes per 90",
    "forward_passes": "Forward passes per 90",
    "long_passes": "Long passes per 90",
    "progressive_passes": "Progressive passes per 90",
    "final_third_passes": "Passes to final third per 90",
    "penalty_area_passes": "Passes to penalty area per 90",
    "key_passes": "Key passes per 90",
    "shot_assists": "Shot assists per 90",
    "smart_passes": "Smart passes per 90",
    "through_passes": "Through passes per 90",
    "box_touches": "Touches in box per 90",
    "shots": "Shots per 90",
    "accelerations": "Accelerations per 90",
}


CENTRAL_MIDFIELDER_ANALYSIS_COLUMNS = {
    *EVENT_COLUMNS.values(),
    "PAdj Interceptions",
    "PAdj Sliding tackles",
    "Total Distance per 90",
    "High Intensity Distance per 90",
    "Sprinting Distance per 90 (+25 km/h)",
    "Meters per minute",
    "xG per 90",
    "Total actions per 90",
    "Total actions",
}


CENTRAL_MIDFIELDER_PILLAR_SPECS: dict[str, dict[str, Any]] = {
    "coverage": {
        "name": "覆盖跑动",
        "features": {
            "direct:Total Distance per 90": 0.35,
            "direct:High Intensity Distance per 90": 0.25,
            "direct:Meters per minute": 0.20,
            "direct:Sprinting Distance per 90 (+25 km/h)": 0.10,
            "event:accelerations": 0.10,
        },
    },
    "defense": {
        "name": "防守参与",
        "features": {
            "event:successful_defensive_actions": 0.35,
            "event:defensive_duels": 0.25,
            "direct:PAdj Interceptions": 0.20,
            "direct:PAdj Sliding tackles": 0.10,
            "event:shots_blocked": 0.10,
        },
    },
    "physical": {
        "name": "身体参与",
        "features": {
            "event:duels": 0.40,
            "event:aerial_duels": 0.25,
            "event:offensive_duels": 0.25,
            "event:fouls_suffered": 0.10,
        },
    },
    "carrying": {
        "name": "持球推进",
        "features": {
            "event:progressive_runs": 0.35,
            "event:dribbles": 0.30,
            "event:offensive_duels": 0.20,
            "event:fouls_suffered": 0.15,
        },
    },
    "passing_progression": {
        "name": "传球推进",
        "features": {
            "event:progressive_passes": 0.35,
            "event:final_third_passes": 0.25,
            "event:penalty_area_passes": 0.15,
            "direct:forward_pass_share": 0.15,
            "event:long_passes": 0.10,
        },
    },
    "link": {
        "name": "控球连接",
        "features": {
            "event:passes": 0.40,
            "event:received_passes": 0.35,
            "event:long_passes": 0.15,
            "event:progressive_passes": 0.10,
        },
    },
    "creation": {
        "name": "机会创造",
        "features": {
            "event:key_passes": 0.25,
            "event:shot_assists": 0.25,
            "event:smart_passes": 0.20,
            "event:through_passes": 0.15,
            "event:penalty_area_passes": 0.15,
        },
    },
    "box_arrival": {
        "name": "后插上威胁",
        "features": {
            "event:box_touches": 0.45,
            "event:shots": 0.30,
            "direct:xG per 90": 0.15,
            "event:accelerations": 0.10,
        },
    },
}


def _metric(raw: dict[str, Any], canonical: str, columns: dict[str, str], to_float: Callable[[Any], float | None]) -> float | None:
    column = columns.get(canonical, "")
    return to_float(raw.get(column)) if column else None


def _percentile_feature(values: dict[int, float]) -> dict[int, float]:
    if len(values) < MIN_ANALYSIS_COHORT:
        return {}
    sorted_values = sorted(values.values())
    return {index: percentile_pair(sorted_values, value, alpha=0.0)["rawPercentile"] / 100.0 for index, value in values.items()}


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


def _central_midfielder_role_evidence(pillars: dict[str, float]) -> dict[str, dict[str, Any]]:
    coverage = pillars.get("coverage")
    defense = pillars.get("defense")
    physical = pillars.get("physical")
    carrying = pillars.get("carrying")
    passing = pillars.get("passing_progression")
    link = pillars.get("link")
    creation = pillars.get("creation")
    box_arrival = pillars.get("box_arrival")

    two_way = sqrt(max(0.0, defense * box_arrival)) if defense is not None and box_arrival is not None else _mean_available(defense, box_arrival)
    coverage_two_way_core = sqrt(max(0.0, coverage * two_way)) if coverage is not None and two_way is not None else None
    carry_pass_core = sqrt(max(0.0, carrying * passing)) if carrying is not None and passing is not None else None
    link_pass_core = sqrt(max(0.0, link * passing)) if link is not None and passing is not None else None

    return {
        "box_to_box_midfielder": _weighted_evidence([
            ("coverage_two_way_core", coverage_two_way_core, B2B_EVIDENCE_WEIGHTS["coverage_two_way_core"]),
            ("carrying", carrying, B2B_EVIDENCE_WEIGHTS["carrying"]),
            ("passing_progression", passing, B2B_EVIDENCE_WEIGHTS["passing_progression"]),
            ("physical", physical, B2B_EVIDENCE_WEIGHTS["physical"]),
        ]),
        "progressive_number_eight": _weighted_evidence([
            ("carry_pass_core", carry_pass_core, PROGRESSIVE_EVIDENCE_WEIGHTS["carry_pass_core"]),
            ("link", link, PROGRESSIVE_EVIDENCE_WEIGHTS["link"]),
            ("creation", creation, PROGRESSIVE_EVIDENCE_WEIGHTS["creation"]),
            ("box_arrival", box_arrival, PROGRESSIVE_EVIDENCE_WEIGHTS["box_arrival"]),
        ]),
        "central_playmaker": _weighted_evidence([
            ("link_pass_core", link_pass_core, PLAYMAKER_EVIDENCE_WEIGHTS["link_pass_core"]),
            ("creation", creation, PLAYMAKER_EVIDENCE_WEIGHTS["creation"]),
            ("carrying", carrying, PLAYMAKER_EVIDENCE_WEIGHTS["carrying"]),
            ("coverage", coverage, PLAYMAKER_EVIDENCE_WEIGHTS["coverage"]),
        ]),
    }


def _position_tokens(value: Any) -> list[str]:
    return [token.strip().upper() for token in re.split(r"[,;/|、]+", str(value or "")) if token.strip()]


def _position_context(candidate: dict[str, Any]) -> dict[str, Any]:
    tokens = _position_tokens(candidate.get("positionValue"))
    ranks = [index + 1 for index, token in enumerate(tokens) if token in {"RCMF", "LCMF", "CMF"}]
    first_rank = min(ranks) if ranks else 0
    reliability = 1.0 if first_rank == 1 else 0.75 if first_rank == 2 else 0.55 if first_rank > 2 else 0.0
    label = "中前卫为第一位置" if first_rank == 1 else "中前卫为第二位置" if first_rank == 2 else "中前卫为第三及以后位置" if first_rank else "缺少中前卫位置记录"
    return {"reliability": reliability, "positionRank": first_rank, "label": label}


def build_central_midfielder_archetypes(
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
        event_values = {event_id: _metric(raw, canonical, columns, to_float) for event_id, canonical in EVENT_COLUMNS.items()}
        duels = event_values.get("duels")
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

        if passes is not None and passes > 0:
            forward_passes = event_values.get("forward_passes")
            if forward_passes is not None:
                raw_features.setdefault("direct:forward_pass_share", {})[index] = max(0.0, forward_passes / passes)
        for canonical in (
            "PAdj Interceptions",
            "PAdj Sliding tackles",
            "Total Distance per 90",
            "High Intensity Distance per 90",
            "Sprinting Distance per 90 (+25 km/h)",
            "Meters per minute",
            "xG per 90",
        ):
            value = _metric(raw, canonical, columns, to_float)
            if value is not None:
                raw_features.setdefault(f"direct:{canonical}", {})[index] = value

    feature_percentiles = {feature: _percentile_feature(values) for feature, values in raw_features.items()}
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
        for pillar_id, pillar in CENTRAL_MIDFIELDER_PILLAR_SPECS.items():
            weighted = available_weight = coverage_weight = 0.0
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
            pillar_rows.append({"id": pillar_id, "name": pillar["name"], "score": None if score is None else score * 100.0, "coverage": coverage})

        coverage = pillar_coverage_sum / len(CENTRAL_MIDFIELDER_PILLAR_SPECS)
        context = _position_context(candidate)
        fits: list[dict[str, Any]] = []
        if len(pillar_values) >= 4:
            evidence_by_role = _central_midfielder_role_evidence(pillar_values)
            for role_id, name in CENTRAL_MIDFIELDER_ROLE_NAMES.items():
                evidence = evidence_by_role[role_id]
                evidence_score = evidence["score"]
                eligible = evidence_score is not None and float(evidence["coverage"]) >= 0.50
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
                    "eligibilityReason": "" if eligible else "职责相似度字段覆盖不足",
                })

        fits.sort(key=lambda item: (not bool(item["eligible"]), -float(item["score"]), str(item["name"])))
        eligible_fits = [item for item in fits if item["eligible"]]
        primary = eligible_fits[0] if eligible_fits else None
        secondary = eligible_fits[1] if len(eligible_fits) > 1 else None
        margin = abs(float(primary["score"] - secondary["score"])) if primary and secondary else 0.0
        if primary is None:
            label, status = "数据不足", "insufficient"
        elif float(primary["score"]) < ROLE_ASSIGNMENT_FLOOR:
            label, status = "职责特征不突出", "uncertain"
        elif secondary and float(primary["score"]) >= DUAL_ROLE_HIGH_SCORE and float(secondary["score"]) >= DUAL_ROLE_HIGH_SCORE and margin <= DUAL_ROLE_HIGH_MAX_GAP:
            label, status = f"{primary['name']} / {secondary['name']}复合型", "uncertain"
        elif secondary and float(primary["score"]) >= DUAL_ROLE_SOLID_SCORE and float(secondary["score"]) >= DUAL_ROLE_SOLID_SCORE and margin <= DUAL_ROLE_SOLID_MAX_GAP:
            label, status = f"{primary['name']} / {secondary['name']}复合型", "uncertain"
        else:
            label = str(primary["name"])
            status = "clear" if float(primary["score"]) >= ROLE_CLEAR_SCORE and margin >= ROLE_CLEAR_GAP else "leaning"

        minute_reliability = min(1.0, float(candidate["minutes"]) / max(1.0, reliability_minutes))
        role_clarity = min(1.0, margin / 20.0) if primary and secondary else 0.0
        data_confidence = coverage * minute_reliability * float(context["reliability"])
        relative_separation = max(0.0, min(1.0, margin / max(1.0, float(primary["score"])))) if primary and secondary else 0.0
        results[index] = {
            "enabled": True,
            "kind": "central_midfielder",
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
            "positionReliability": context["reliability"],
            "positionContext": context["label"],
            "denominatorMode": denominator_modes.get(index, "行为量不足"),
            "fits": fits,
            "pillars": pillar_rows,
        }
    return results
