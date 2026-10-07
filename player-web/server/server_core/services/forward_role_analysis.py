from __future__ import annotations

from math import sqrt
from typing import Any, Callable

from server_core.services.percentile_service import percentile_pair, smoothing_profile


FORWARD_ROLE_IDS = {"target_forward", "poacher", "power_forward", "complete_forward", "playmaking_forward"}
ELITE_THRESHOLD = 90.0
ELITE_MAX_POINTS = 15.0
PAIR_PRIOR_ATTEMPTS = 20.0
PAIR_SCORE_FORMULA = "35%次数百分位 + 45%调整成功次数/90百分位 + 20%贝叶斯调整成功率百分位"
PAIR_BAYES_FORMULA = "调整成功率 =（估算成功次数 + 20 × 同位置加权平均成功率）÷（估算尝试次数 + 20）"
MIN_ANALYSIS_COHORT = 8
COMPLETE_FORWARD_MIN_AVAILABLE_PILLARS = 5
TARGET_EVIDENCE_WEIGHTS = {"hold_aerial_core": 0.65, "link": 0.20, "box": 0.15}
POACHER_EVIDENCE_WEIGHTS = {"box": 0.50, "aerial": 0.35, "depth": 0.15}
POWER_EVIDENCE_WEIGHTS = {"depth_carry_core": 0.65, "hold_up": 0.25, "work": 0.10}
PLAYMAKING_EVIDENCE_WEIGHTS = {"creation": 0.50, "link": 0.35, "carry": 0.15}
COMPLETE_EVIDENCE_WEIGHTS = {
    "participation_coverage": 0.45,
    "connector_presence": 0.30,
    "balance": 0.15,
    "raw_activity_mean": 0.10,
}
COMPLETE_PRESENCE_LOW = 0.15
COMPLETE_PRESENCE_FULL = 0.40
COMPLETE_DIRECTNESS_ALLOWANCE = 0.10
COMPLETE_DIRECTNESS_PENALTY_RATE = 1.20
COMPLETE_DIRECTNESS_PENALTY_CAP = 0.20
COMPLETE_SCORE_CONTRAST_EXPONENT = 1.35
COMPLETE_ROLE_MIN_AXIS = 0.40
COMPLETE_ROLE_MIN_MEAN = 0.65
COMPLETE_ROLE_MIN_COVERAGE = 0.98
COMPLETE_ROLE_NEAR_TOP_GAP = 3.0
POACHER_BOX_DOMINANCE_MARGIN = 0.10
DUAL_ROLE_HIGH_SCORE = 70.0
DUAL_ROLE_HIGH_MAX_GAP = 3.0
DUAL_ROLE_SOLID_SCORE = 65.0
DUAL_ROLE_SOLID_MAX_GAP = 2.0
ROLE_ASSIGNMENT_FLOOR = 45.0
ROLE_CLEAR_SCORE = 60.0
ROLE_CLEAR_GAP = 5.0


PAIR_SPECS = (
    {"id": "duel_effectiveness", "label": "对抗有效性", "volume": "Duels per 90", "rate": "Duels won, %"},
    {"id": "aerial_effectiveness", "label": "空中对抗有效性", "volume": "Aerial duels per 90", "rate": "Aerial duels won, %"},
    {"id": "dribble_effectiveness", "label": "盘带有效性", "volume": "Dribbles per 90", "rate": "Successful dribbles, %"},
    {"id": "offensive_duel_effectiveness", "label": "进攻对抗有效性", "volume": "Offensive duels per 90", "rate": "Offensive duels won, %"},
    {"id": "crossing_effectiveness", "label": "传中有效性", "volume": "Crosses per 90", "rate": "Accurate crosses, %"},
    {"id": "finishing_effectiveness", "label": "射门转化有效性", "volume": "Shots per 90", "rate": "Goal conversion, %"},
)


PILLAR_SPECS: dict[str, dict[str, Any]] = {
    "hold_up": {
        "name": "支点参与",
        "features": {"duel_share": 0.55, "Fouls suffered per 90": 0.20, "Received long passes per 90": 0.25},
    },
    "aerial": {
        "name": "制空倾向",
        "features": {"Aerial duels per 90": 0.60, "aerial_share": 0.40},
    },
    "box": {
        "name": "禁区存在",
        "features": {"Touches in box per 90": 0.45, "Shots per 90": 0.30, "shot_share": 0.25},
    },
    "depth": {
        "name": "纵深冲击",
        "features": {
            "Accelerations per 90": 0.30,
            "Progressive runs per 90": 0.30,
            "Sprinting Distance per 90 (+25 km/h)": 0.25,
            "Max Speed (km/h)": 0.15,
        },
    },
    "carry": {
        "name": "持球突破",
        "features": {
            "dribble_share": 0.35,
            "Dribbles per 90": 0.30,
            "Offensive duels per 90": 0.20,
            "Crosses per 90": 0.15,
        },
    },
    "link": {
        "name": "连接参与",
        "features": {"pass_share": 0.25, "Received passes per 90": 0.25, "Passes to penalty area per 90": 0.20, "Key passes per 90": 0.15, "Progressive passes per 90": 0.15},
    },
    "creation": {
        "name": "组织创造",
        "features": {"Key passes per 90": 0.35, "Shot assists per 90": 0.25, "Passes to penalty area per 90": 0.20, "Through passes per 90": 0.20},
    },
    "work": {
        "name": "跑动防守",
        "features": {"Successful defensive actions per 90": 0.55, "Total Distance per 90": 0.45},
    },
}


FORWARD_ROLE_NAMES = {
    "target_forward": "支点中锋",
    "poacher": "抢点型前锋",
    "power_forward": "冲击型前锋",
    "complete_forward": "全能前锋",
    "playmaking_forward": "组织型前锋",
}


def _safe_number(value: Any, to_float: Callable[[Any], float | None]) -> float | None:
    number = to_float(value)
    return number if number is not None else None


def _metric(raw: dict[str, Any], canonical: str, columns: dict[str, str], to_float: Callable[[Any], float | None]) -> float | None:
    column = columns.get(canonical, "")
    return _safe_number(raw.get(column), to_float) if column else None


def build_forward_pair_scores(
    candidates: list[dict[str, Any]],
    *,
    model_metric_columns: set[str],
    columns: dict[str, str],
    to_float: Callable[[Any], float | None],
) -> tuple[dict[int, dict[str, dict[str, Any]]], dict[str, dict[str, Any]]]:
    by_candidate: dict[int, dict[str, dict[str, Any]]] = {index: {} for index in range(len(candidates))}
    metadata: dict[str, dict[str, Any]] = {}
    for spec in PAIR_SPECS:
        volume_name = str(spec["volume"])
        rate_name = str(spec["rate"])
        if volume_name not in model_metric_columns or rate_name not in model_metric_columns:
            continue
        if not columns.get(volume_name) or not columns.get(rate_name):
            continue

        observations: list[dict[str, float | int]] = []
        total_attempts = 0.0
        total_successes = 0.0
        fallback_rates: list[float] = []
        for index, candidate in enumerate(candidates):
            volume = _metric(candidate["raw"], volume_name, columns, to_float)
            rate_percent = _metric(candidate["raw"], rate_name, columns, to_float)
            if volume is None or rate_percent is None or volume < 0:
                continue
            rate = max(0.0, min(1.0, rate_percent / 100.0))
            attempts = max(0.0, volume * float(candidate["minutes"]) / 90.0)
            successes = attempts * rate
            observations.append({"index": index, "volume": volume, "rate": rate, "attempts": attempts, "successes": successes})
            total_attempts += attempts
            total_successes += successes
            fallback_rates.append(rate)
        if len(observations) < MIN_ANALYSIS_COHORT:
            continue

        prior_mean = total_successes / total_attempts if total_attempts > 0 else sum(fallback_rates) / len(fallback_rates)
        volumes: list[float] = []
        successful_per90_values: list[float] = []
        adjusted_rate_values: list[float] = []
        prepared: list[dict[str, float | int]] = []
        for observation in observations:
            attempts = float(observation["attempts"])
            adjusted_rate = (float(observation["successes"]) + PAIR_PRIOR_ATTEMPTS * prior_mean) / (attempts + PAIR_PRIOR_ATTEMPTS)
            volume = float(observation["volume"])
            successful_per90 = volume * adjusted_rate
            prepared.append({**observation, "adjustedRate": adjusted_rate, "successfulPer90": successful_per90})
            volumes.append(volume)
            successful_per90_values.append(successful_per90)
            adjusted_rate_values.append(adjusted_rate * 100.0)

        sorted_volumes = sorted(volumes)
        sorted_successful = sorted(successful_per90_values)
        sorted_rates = sorted(adjusted_rate_values)
        volume_alpha = smoothing_profile(sorted_volumes)["alpha"]
        successful_alpha = smoothing_profile(sorted_successful)["alpha"]
        rate_alpha = smoothing_profile(sorted_rates)["alpha"]
        group_scores: list[float] = []
        provisional: dict[int, dict[str, Any]] = {}
        for observation in prepared:
            volume_score = percentile_pair(sorted_volumes, float(observation["volume"]), alpha=volume_alpha)["adjustedPercentile"]
            successful_score = percentile_pair(sorted_successful, float(observation["successfulPer90"]), alpha=successful_alpha)["adjustedPercentile"]
            rate_score = percentile_pair(sorted_rates, float(observation["adjustedRate"]) * 100.0, alpha=rate_alpha)["adjustedPercentile"]
            score = 0.35 * volume_score + 0.45 * successful_score + 0.20 * rate_score
            index = int(observation["index"])
            provisional[index] = {
                "score": score,
                "volumeScore": volume_score,
                "successfulScore": successful_score,
                "rateScore": rate_score,
                "adjustedRate": float(observation["adjustedRate"]) * 100.0,
                "successfulPer90": float(observation["successfulPer90"]),
            }
            group_scores.append(score)

        sorted_group_scores = sorted(group_scores)
        raw_percentile_ceiling = percentile_pair(sorted_group_scores, sorted_group_scores[-1], alpha=0.0)["rawPercentile"]
        for index, item in provisional.items():
            raw_percentile = percentile_pair(sorted_group_scores, float(item["score"]), alpha=0.0)["rawPercentile"]
            by_candidate[index][str(spec["id"])] = {
                **item,
                "rawPercentile": raw_percentile,
                "rawPercentileCeiling": raw_percentile_ceiling,
            }
        metadata[str(spec["id"])] = {
            **spec,
            "cohortCount": len(observations),
            "priorMean": prior_mean * 100.0,
            "priorAttempts": PAIR_PRIOR_ATTEMPTS,
            "formula": PAIR_SCORE_FORMULA,
            "bayesFormula": PAIR_BAYES_FORMULA,
        }
    return by_candidate, metadata


def elite_metric_score(
    percentile: float,
    raw_percentile: float,
    raw_percentile_ceiling: float,
    enabled: bool,
) -> dict[str, float | bool]:
    """Apply the elite lift to one metric instead of adding a player-level bonus.

    The lift starts continuously at the top-decile boundary and reaches at most
    15 points for a raw percentile of 100.  The scoring percentile is capped at
    100, so every extra point remains attributable to this exact metric.
    """
    base = max(0.0, min(100.0, float(percentile)))
    raw = max(0.0, min(100.0, float(raw_percentile)))
    if not enabled or raw < ELITE_THRESHOLD:
        return {"score": base, "bonus": 0.0, "eligible": False}
    ceiling = max(ELITE_THRESHOLD, min(100.0, float(raw_percentile_ceiling)))
    progress = 1.0 if ceiling <= ELITE_THRESHOLD else (raw - ELITE_THRESHOLD) / (ceiling - ELITE_THRESHOLD)
    progress = max(0.0, min(1.0, progress))
    bonus = min(100.0 - base, ELITE_MAX_POINTS * progress)
    return {"score": base + max(0.0, bonus), "bonus": max(0.0, bonus), "eligible": True}


def _percentile_feature(values: dict[int, float]) -> dict[int, float]:
    if len(values) < MIN_ANALYSIS_COHORT:
        return {}
    sorted_values = sorted(values.values())
    return {index: percentile_pair(sorted_values, value, alpha=0.0)["rawPercentile"] / 100.0 for index, value in values.items()}


def _mean_available(*values: float | None) -> float | None:
    available = [float(value) for value in values if value is not None]
    return sum(available) / len(available) if available else None


def _complete_forward_profile(pillar_values: dict[str, float]) -> dict[str, Any]:
    """Measure duty breadth without treating below-median activity as absence.

    A percentile of 0.25 still means that the player performs the action.  Each
    axis is therefore mapped through a soft presence band (15th–40th
    percentile) before coverage is calculated.  A separate directness penalty
    prevents a physical runner with little link/creation work from being called
    all-round merely because every source field is non-zero.
    """
    axes = {
        "支点制空": _mean_available(pillar_values.get("hold_up"), pillar_values.get("aerial")),
        "禁区终结": pillar_values.get("box"),
        "纵深突破": _mean_available(pillar_values.get("depth"), pillar_values.get("carry")),
        "回撤连接": pillar_values.get("link"),
        "组织创造": pillar_values.get("creation"),
    }
    available = [float(value) for value in axes.values() if value is not None]
    available_count = len(available)
    mean = sum(available) / available_count if available_count else 0.0
    minimum = min(available) if available else 0.0
    variance = sum((value - mean) ** 2 for value in available) / available_count if available_count else 0.0
    balance = max(0.0, min(1.0, 1.0 - sqrt(variance) / mean)) if mean > 0 else 0.0
    presence_span = COMPLETE_PRESENCE_FULL - COMPLETE_PRESENCE_LOW
    presence_values = [
        max(0.0, min(1.0, (value - COMPLETE_PRESENCE_LOW) / presence_span))
        for value in available
    ]
    participation_coverage = sum(presence_values) / available_count if available_count else 0.0
    connector_values = [
        value
        for value in (pillar_values.get("link"), pillar_values.get("creation"))
        if value is not None
    ]
    connector_presence = max(connector_values) if connector_values else 0.0
    direct_values = [
        value
        for value in (pillar_values.get("hold_up"), pillar_values.get("depth"), pillar_values.get("carry"))
        if value is not None
    ]
    connective_values = [
        value
        for value in (pillar_values.get("link"), pillar_values.get("creation"))
        if value is not None
    ]
    direct_mean = sum(direct_values) / len(direct_values) if direct_values else 0.0
    connective_mean = sum(connective_values) / len(connective_values) if connective_values else 0.0
    directness_excess = max(0.0, direct_mean - connective_mean - COMPLETE_DIRECTNESS_ALLOWANCE)
    directness_penalty = min(
        COMPLETE_DIRECTNESS_PENALTY_CAP,
        COMPLETE_DIRECTNESS_PENALTY_RATE * directness_excess,
    )
    data_reasons: list[str] = []
    if available_count < COMPLETE_FORWARD_MIN_AVAILABLE_PILLARS:
        data_reasons.append(f"五类行为轴仅有{available_count}项可计算")
    base_score = (
        COMPLETE_EVIDENCE_WEIGHTS["participation_coverage"] * participation_coverage
        + COMPLETE_EVIDENCE_WEIGHTS["connector_presence"] * connector_presence
        + COMPLETE_EVIDENCE_WEIGHTS["balance"] * balance
        + COMPLETE_EVIDENCE_WEIGHTS["raw_activity_mean"] * mean
    ) if available_count else None
    adjusted_score = max(0.0, float(base_score) - directness_penalty) if base_score is not None else None
    score = adjusted_score ** COMPLETE_SCORE_CONTRAST_EXPONENT if adjusted_score is not None else None
    qualification_reasons: list[str] = []
    if minimum < COMPLETE_ROLE_MIN_AXIS:
        qualification_reasons.append(f"最弱核心行为低于{COMPLETE_ROLE_MIN_AXIS * 100:.0f}分")
    if mean < COMPLETE_ROLE_MIN_MEAN:
        qualification_reasons.append(f"五类核心行为均值低于{COMPLETE_ROLE_MIN_MEAN * 100:.0f}分")
    if participation_coverage < COMPLETE_ROLE_MIN_COVERAGE:
        qualification_reasons.append(f"柔性参与覆盖低于{COMPLETE_ROLE_MIN_COVERAGE * 100:.0f}%")
    data_eligible = not data_reasons
    role_eligible = data_eligible and not qualification_reasons
    return {
        "eligible": role_eligible,
        "dataEligible": data_eligible,
        "roleEligible": role_eligible,
        "reasons": data_reasons + qualification_reasons,
        "dataReasons": data_reasons,
        "qualificationReasons": qualification_reasons,
        "availableAxisCount": available_count,
        "activityCoverage": participation_coverage,
        "rawActivityMean": mean,
        "breadthFloor": minimum,
        "connectorPresence": connector_presence,
        "balance": balance,
        "directnessExcess": directness_excess,
        "directnessPenalty": directness_penalty,
        "baseScoreBeforeDirectness": base_score,
        "score": score,
        "axes": [{"name": name, "score": value} for name, value in axes.items()],
        "definition": "以五类核心行为的整体水平和最弱项设置全能准入门槛；直接打法明显压过连接创造时降低全能相似度。",
    }


def _weighted_evidence(components: list[tuple[str, float | None, float]]) -> dict[str, Any]:
    available = [(name, value, weight) for name, value, weight in components if value is not None]
    available_weight = sum(weight for _, _, weight in available)
    total_weight = sum(weight for _, _, weight in components)
    score = (
        sum(float(value) * weight for _, value, weight in available) / available_weight
        if available_weight > 0
        else None
    )
    return {
        "score": score,
        "coverage": available_weight / total_weight if total_weight > 0 else 0.0,
        "components": [
            {"id": name, "value": value, "weight": weight, "available": value is not None}
            for name, value, weight in components
        ],
    }


def _forward_role_evidence(pillar_values: dict[str, float]) -> dict[str, dict[str, Any]]:
    """Build five independent, auditable behavioural-similarity scores.

    Each score answers a different football question instead of measuring all
    players against four nearby centroids.  Geometric cores prevent one high
    pillar from fully compensating for a missing defining behaviour.
    """
    hold = pillar_values.get("hold_up")
    aerial = pillar_values.get("aerial")
    box = pillar_values.get("box")
    depth = pillar_values.get("depth")
    carry = pillar_values.get("carry")
    link = pillar_values.get("link")
    creation = pillar_values.get("creation")
    work = pillar_values.get("work")
    hold_aerial_core = sqrt(max(0.0, hold * aerial)) if hold is not None and aerial is not None else None
    depth_carry_core = sqrt(max(0.0, depth * carry)) if depth is not None and carry is not None else None
    complete_profile = _complete_forward_profile(pillar_values)
    poacher_support_mean = _mean_available(depth, carry)
    poacher_dominance = (
        float(box) - float(poacher_support_mean)
        if box is not None and poacher_support_mean is not None
        else None
    )
    poacher_eligible = poacher_dominance is not None and poacher_dominance >= POACHER_BOX_DOMINANCE_MARGIN
    poacher_evidence = _weighted_evidence([
        ("box", box, POACHER_EVIDENCE_WEIGHTS["box"]),
        ("aerial", aerial, POACHER_EVIDENCE_WEIGHTS["aerial"]),
        ("depth", depth, POACHER_EVIDENCE_WEIGHTS["depth"]),
    ])
    poacher_evidence.update({
        "eligible": poacher_eligible,
        "eligibilityReason": "" if poacher_eligible else "禁区存在未明显高于纵深与持球参与，抢点特征不主导",
        "boxDominance": poacher_dominance,
    })
    complete_evidence = _weighted_evidence([
        ("participation_coverage", complete_profile["activityCoverage"], COMPLETE_EVIDENCE_WEIGHTS["participation_coverage"]),
        ("connector_presence", complete_profile["connectorPresence"], COMPLETE_EVIDENCE_WEIGHTS["connector_presence"]),
        ("balance", complete_profile["balance"], COMPLETE_EVIDENCE_WEIGHTS["balance"]),
        ("raw_activity_mean", complete_profile["rawActivityMean"], COMPLETE_EVIDENCE_WEIGHTS["raw_activity_mean"]),
    ])
    complete_evidence.update({
        "score": complete_profile["score"],
        "directnessPenalty": complete_profile["directnessPenalty"],
        "baseScoreBeforeDirectness": complete_profile["baseScoreBeforeDirectness"],
    })

    return {
        "target_forward": _weighted_evidence([
            ("hold_aerial_core", hold_aerial_core, TARGET_EVIDENCE_WEIGHTS["hold_aerial_core"]),
            ("link", link, TARGET_EVIDENCE_WEIGHTS["link"]),
            ("box", box, TARGET_EVIDENCE_WEIGHTS["box"]),
        ]),
        "poacher": poacher_evidence,
        "power_forward": _weighted_evidence([
            ("depth_carry_core", depth_carry_core, POWER_EVIDENCE_WEIGHTS["depth_carry_core"]),
            ("hold_up", hold, POWER_EVIDENCE_WEIGHTS["hold_up"]),
            ("work", work, POWER_EVIDENCE_WEIGHTS["work"]),
        ]),
        "complete_forward": complete_evidence,
        "playmaking_forward": _weighted_evidence([
            ("creation", creation, PLAYMAKING_EVIDENCE_WEIGHTS["creation"]),
            ("link", link, PLAYMAKING_EVIDENCE_WEIGHTS["link"]),
            ("carry", carry, PLAYMAKING_EVIDENCE_WEIGHTS["carry"]),
        ]),
    }


def _forward_position_context(position_value: Any) -> dict[str, Any]:
    normalized = str(position_value or "").upper()
    for separator in ("/", ";", "|", "、"):
        normalized = normalized.replace(separator, ",")
    tokens = [token.strip() for token in normalized.split(",") if token.strip()]
    try:
        cf_index = tokens.index("CF")
    except ValueError:
        cf_index = -1
    if cf_index == 0:
        return {"reliability": 1.0, "label": "CF为第一位置", "rank": 1}
    if cf_index == 1:
        return {"reliability": 0.75, "label": "CF为第二位置", "rank": 2}
    if cf_index >= 2:
        return {"reliability": 0.55, "label": f"CF为第{cf_index + 1}位置", "rank": cf_index + 1}
    return {"reliability": 0.0, "label": "未识别中锋位置", "rank": 0}


def build_forward_archetypes(
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
        direct_values: dict[str, float] = {}
        for pillar in PILLAR_SPECS.values():
            for feature in pillar["features"]:
                if feature in {"duel_share", "aerial_share", "shot_share", "dribble_share", "pass_share"}:
                    continue
                value = _metric(raw, feature, columns, to_float)
                if value is not None:
                    direct_values[feature] = value
                    raw_features.setdefault(feature, {})[index] = value

        duels = _metric(raw, "Duels per 90", columns, to_float)
        aerials = _metric(raw, "Aerial duels per 90", columns, to_float)
        passes = _metric(raw, "Passes per 90", columns, to_float)
        shots = _metric(raw, "Shots per 90", columns, to_float)
        dribbles = _metric(raw, "Dribbles per 90", columns, to_float)
        provided_total = _safe_number(raw.get(total_actions_column), to_float) if total_actions_column else None
        provided_total_count = _safe_number(raw.get(total_actions_count_column), to_float) if total_actions_count_column else None
        proxy_parts = [value for value in (duels, passes, shots, dribbles) if value is not None and value >= 0]
        if provided_total is not None and provided_total > 0:
            denominator = provided_total
            denominator_modes[index] = "源表总行动数/90"
        elif provided_total_count is not None and provided_total_count > 0 and float(candidate["minutes"]) > 0:
            denominator = provided_total_count * 90.0 / float(candidate["minutes"])
            denominator_modes[index] = "源表总行动数换算/90"
        elif len(proxy_parts) >= 2 and sum(proxy_parts) > 0:
            denominator = sum(proxy_parts)
            denominator_modes[index] = "代理行动结构"
        else:
            denominator = None
            denominator_modes[index] = "行为量不足"
        for feature, numerator in {
            "duel_share": duels,
            "shot_share": shots,
            "dribble_share": dribbles,
            "pass_share": passes,
        }.items():
            if denominator and numerator is not None:
                raw_features.setdefault(feature, {})[index] = max(0.0, numerator / denominator)
        if duels is not None and duels > 0 and aerials is not None:
            raw_features.setdefault("aerial_share", {})[index] = max(0.0, aerials / duels)

    feature_percentiles = {feature: _percentile_feature(values) for feature, values in raw_features.items()}
    results: dict[int, dict[str, Any]] = {}
    for index, candidate in enumerate(candidates):
        pillar_rows: list[dict[str, Any]] = []
        pillar_values: dict[str, float] = {}
        pillar_coverage_sum = 0.0
        for pillar_id, pillar in PILLAR_SPECS.items():
            weighted = 0.0
            available_weight = 0.0
            for feature, weight in pillar["features"].items():
                percentile = feature_percentiles.get(feature, {}).get(index)
                if percentile is None:
                    continue
                weighted += float(weight) * percentile
                available_weight += float(weight)
            score = weighted / available_weight if available_weight > 0 else None
            coverage = available_weight / sum(float(weight) for weight in pillar["features"].values())
            pillar_coverage_sum += coverage
            if score is not None:
                pillar_values[pillar_id] = score
            pillar_rows.append({"id": pillar_id, "name": pillar["name"], "score": None if score is None else score * 100.0, "coverage": coverage})

        coverage = pillar_coverage_sum / len(PILLAR_SPECS)
        fits: list[dict[str, Any]] = []
        complete_gate = _complete_forward_profile(pillar_values)
        position_context = _forward_position_context(candidate.get("positionValue"))
        if len(pillar_values) >= 4:
            evidence_by_role = _forward_role_evidence(pillar_values)
            for role_id, name in FORWARD_ROLE_NAMES.items():
                evidence = evidence_by_role[role_id]
                evidence_score = evidence["score"]
                eligible = (
                    evidence_score is not None
                    and float(evidence["coverage"]) >= 0.50
                    and bool(evidence.get("eligible", True))
                    and (role_id != "complete_forward" or bool(complete_gate["eligible"]))
                )
                score = 100.0 * float(evidence_score) if evidence_score is not None else 0.0
                distance = 1.0 - float(evidence_score) if evidence_score is not None else 1.0
                fits.append({
                    "roleId": role_id,
                    "name": name,
                    "score": score,
                    "distance": distance,
                    "baseScore": score,
                    "baseDistance": distance,
                    "distanceAdjustment": 0.0,
                    "adjustmentReason": "五类独立行为相似度公式",
                    "evidenceScore": evidence_score,
                    "evidenceCoverage": evidence["coverage"],
                    "evidenceComponents": evidence["components"],
                    "eligible": eligible,
                    "eligibilityReason": "" if eligible else (
                        "；".join(complete_gate["reasons"])
                        if role_id == "complete_forward" and complete_gate["reasons"]
                        else str(evidence.get("eligibilityReason") or "职责相似度字段覆盖不足")
                    ),
                })
        for item in fits:
            item["similarity"] = float(item["score"])
            # Kept only for older clients.  It is not a probability and the five
            # values are intentionally not normalized to sum to one.
            item["probability"] = float(item["score"]) / 100.0 if item["eligible"] else 0.0
        fits.sort(key=lambda item: (not bool(item["eligible"]), -float(item["score"]), str(item["name"])))
        eligible_fits = [item for item in fits if item["eligible"]]
        primary = eligible_fits[0] if eligible_fits else None
        secondary = eligible_fits[1] if len(eligible_fits) > 1 else None
        complete_candidate = next(
            (item for item in eligible_fits if item["roleId"] == "complete_forward"),
            None,
        )
        if (
            primary
            and complete_candidate
            and primary["roleId"] != "complete_forward"
            and float(primary["score"]) - float(complete_candidate["score"]) <= COMPLETE_ROLE_NEAR_TOP_GAP
        ):
            secondary = primary
            primary = complete_candidate
        margin = float(primary["score"] - secondary["score"]) if primary and secondary else 0.0
        margin = abs(margin)
        probability_gap = margin / 100.0
        relative_separation = (
            max(0.0, min(1.0, margin / max(1.0, float(primary["score"]))))
            if primary and secondary
            else 0.0
        )
        if primary is None:
            label = "数据不足"
            status = "insufficient"
        elif float(primary["score"]) < ROLE_ASSIGNMENT_FLOOR:
            label = "职责特征不突出"
            status = "uncertain"
        elif primary["roleId"] == "complete_forward":
            label = str(primary["name"])
            status = "clear"
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
        data_confidence = coverage * minute_reliability * float(position_context["reliability"])
        results[index] = {
            "enabled": True,
            "label": label,
            "status": status,
            "primaryRoleId": primary["roleId"] if primary else "",
            "primaryName": primary["name"] if primary else "",
            "secondaryRoleId": secondary["roleId"] if secondary else "",
            "secondaryName": secondary["name"] if secondary else "",
            "margin": margin,
            "probabilityGap": probability_gap,
            "relativeSeparation": relative_separation,
            "decisionStrength": role_clarity,
            "roleClarity": role_clarity,
            "dataConfidence": data_confidence,
            "confidence": data_confidence,
            "coverage": coverage,
            "minuteReliability": minute_reliability,
            "positionReliability": position_context["reliability"],
            "positionContext": position_context["label"],
            "denominatorMode": denominator_modes.get(index, "行为量不足"),
            "completeForwardGate": complete_gate,
            "allRoundProfile": complete_gate,
            "fits": fits,
            "pillars": pillar_rows,
        }
    return results
