"""Research goalkeeper behavior evidence; never use save quality as style."""
from __future__ import annotations

import re
from math import sqrt
from typing import Any, Callable

from server_core.services.percentile_service import percentile_pair

GOALKEEPER_ROLE_IDS = {"shot_stopping_goalkeeper", "ball_playing_goalkeeper"}
GOALKEEPER_ANALYSIS_COLUMNS = {
    "Shots against per 90", "Exits per 90", "Aerial duels per 90",
    "Short / medium passes per 90", "Passes per 90", "Received passes per 90",
    "Long passes per 90", "Forward passes per 90", "Progressive passes per 90",
}

# Each feature is (source/derived key, public name, weight).
PILLARS = {
    "shots": ("射门应对负荷", "被射门频率，只是球队防守环境下的应对负荷，不代表扑救质量。", [("Shots against per 90", "每90分钟被射门", 1.)]),
    "exits": ("禁区出击参与", "出击频率不能证明出击成功或站位高低。", [("Exits per 90", "每90分钟出击", 1.)]),
    "aerial": ("高空球参与", "空中争抢参与，不等同于摘传中成功。", [("Aerial duels per 90", "每90分钟空中对抗", 1.)]),
    "direct": ("直接处理倾向", "长传占总传球的比例，提供正向直接处理证据；不等同于解围或低站位。", [("long_share", "长传占总传球比例", 1.)]),
    "short": ("短中传组织", "读取实际短中传数量和占比，不再用传球减长传冒充短传。", [("Short / medium passes per 90", "每90分钟短中传", .6), ("short_share", "短中传占总传球比例", .4)]),
    "long": ("长传发起", "长距离发起频率，不评价落点质量；占比另由直接处理支柱描述。", [("Long passes per 90", "每90分钟长传", 1.)]),
    "progression": ("向前输送", "向前与推进传球参与，不读取成功率。", [("Forward passes per 90", "每90分钟向前传球", .5), ("Progressive passes per 90", "每90分钟推进传球", .5)]),
    "connection": ("传接球参与", "后场循环参与，侧重实际接球；接回传专属字段不再参与识别。", [("Passes per 90", "每90分钟传球", .4), ("Received passes per 90", "每90分钟接球", .6)]),
}
ROLES = {
    "shot_stopping_goalkeeper": {"name": "扑救型门将", "core": "直接处理与相对守门倾向", "support": "高空球参与、禁区出击参与、射门应对负荷",
        "formula": "75%×直接处理与守门倾向的几何均值 + 10%×高空球参与 + 10%×禁区出击参与 + 5%×射门应对负荷",
        "boundary": "守门倾向=100−短中传组织与传接球参与的均值。三支柱须齐备，核心至少40分且有真实长传；组织少不能单独确认扑救型。被射门只占5%，不作为准入条件或能力证据。"},
    "ball_playing_goalkeeper": {"name": "出球型门将", "core": "短中传组织与传接球参与", "support": "向前输送、长传发起",
        "formula": "75%×短中传组织与传接球参与的几何均值 + 20%×向前输送 + 5%×长传发起",
        "boundary": "核心至少45分，实际短中传、接球和短中传占比须有效且有实质行为；接回传不作为准入条件。长传多不能替代组织核心，缺空间和受压数据不能断言能破解高压。"},
}


def goalkeeper_method() -> dict[str, Any]:
    return {"family": "门将", "version": "goalkeeper-behavior-v2", "positionTokens": ["GK"],
        "pillars": [{"id": key, "name": name, "description": description,
            "metrics": [{"name": label, "weight": weight * 100} for _, label, weight in features]}
            for key, (name, description, features) in PILLARS.items()],
        "roles": [{"id": key, **role} for key, role in ROLES.items()]}


def build_goalkeeper_archetypes(candidates: list[dict[str, Any]], *, columns: dict[str, str],
        to_float: Callable[[Any], float | None], reliability_minutes: float) -> dict[int, dict[str, Any]]:
    features: dict[str, dict[int, float]] = {}
    raw_by_index = {}
    for index, candidate in enumerate(candidates):
        raw = {key: to_float(candidate["raw"].get(columns.get(key, ""))) for key in GOALKEEPER_ANALYSIS_COLUMNS}
        raw = {key: value for key, value in raw.items() if value is not None and value >= 0}
        passes, long = raw.get("Passes per 90"), raw.get("Long passes per 90")
        if passes is not None and long is not None and passes > 0 and long <= passes:
            raw["long_share"] = long/passes
        short = raw.get("Short / medium passes per 90")
        if passes is not None and short is not None and passes > 0 and short <= passes:
            raw["short_share"] = short/passes
        elif short is not None:
            raw.pop("Short / medium passes per 90")
        raw_by_index[index] = raw
        for key, value in raw.items():
            features.setdefault(key, {})[index] = value
    percentiles = {}
    for key, observations in features.items():
        if len(observations) < 8:
            continue
        values = sorted(observations.values())
        percentiles[key] = {i: percentile_pair(values, value, alpha=0.)["rawPercentile"] / 100 for i, value in observations.items()}

    results = {}
    for index, candidate in enumerate(candidates):
        rows, scores, covers = [], {}, {}
        for key, (name, _, specs) in PILLARS.items():
            available = [(percentiles.get(feature, {}).get(index), weight) for feature, _, weight in specs]
            present = [(value, weight) for value, weight in available if value is not None]
            coverage = sum(weight for _, weight in present)
            score = sum(value * weight for value, weight in present) / coverage if coverage else None
            covers[key] = coverage
            if score is not None:
                scores[key] = score
            rows.append({"id": key, "name": name, "score": score*100 if score is not None else None, "coverage": coverage})
        raw = raw_by_index[index]
        fits = []
        enough = len(scores) >= 4
        for role_id, role in ROLES.items():
            if role_id == "shot_stopping_goalkeeper":
                required = ["direct", "short", "connection"]
                core = sqrt(scores["direct"] * max(0., 1-(scores["short"]+scores["connection"])/2)) if all(k in scores for k in required) else None
                components = [("core", core, .75), ("aerial", scores.get("aerial"), .10), ("exits", scores.get("exits"), .10), ("shots", scores.get("shots"), .05)]
                observed = raw.get("long_share", 0) > 0 and raw.get("short_share") is not None and raw.get("Received passes per 90") is not None
                core_threshold = .40
            else:
                required = ["short", "connection"]
                core = sqrt(scores["short"] * scores["connection"]) if all(k in scores for k in required) else None
                components = [("core", core, .75), ("progression", scores.get("progression"), .20), ("long", scores.get("long"), .05)]
                observed = raw.get("short_share", 0) > 0 and raw.get("Received passes per 90", 0) > 0
                core_threshold = .45
            coverage = sum(weight * (min(covers[k] for k in required) if key == "core" else covers[key])
                           for key, value, weight in components if value is not None)
            denominator = sum(weight for _, value, weight in components if value is not None)
            score = sum(value*weight for _, value, weight in components if value is not None) / denominator if denominator else 0.
            eligible = enough and core is not None and core >= core_threshold and observed and coverage >= .70
            fits.append({"roleId": role_id, "name": role["name"], "score": score*100,
                "similarity": score*100, "baseScore": score*100, "distance": 1-score, "baseDistance": 1-score,
                "distanceAdjustment": 0., "adjustmentReason": "门将行为代理，需结合球队环境复核", "probability": 0.,
                "evidenceScore": score, "evidenceCoverage": coverage,
                "evidenceComponents": [{"id": key, "value": value, "weight": weight, "available": value is not None} for key, value, weight in components],
                "eligible": eligible, "dataSufficient": enough and core is not None and coverage >= .70,
                "eligibilityReason": "" if eligible else "必要行为缺失、核心强度未达标或覆盖不足70%"})
        fits.sort(key=lambda f: (not f["eligible"], -f["score"], f["roleId"]))
        valid = [fit for fit in fits if fit["eligible"]]
        first = valid[0] if valid else None
        second = valid[1] if len(valid) > 1 else None
        margin = first["score"]-second["score"] if first and second else 0.
        label, status = "数据不足", "insufficient"
        if not first and any(f["dataSufficient"] for f in fits):
            label, status = "职责特征不突出", "uncertain"
        if first:
            if first["score"] < 45:
                label, status = "职责特征不突出", "uncertain"
            elif second and ((second["score"] >= 70 and margin <= 3) or (second["score"] >= 65 and margin <= 2)):
                label, status = f"{first['name']} / {second['name']}复合型", "uncertain"
            else:
                label, status = first["name"], "clear" if second and first["score"] >= 60 and margin >= 5 else "leaning"
        tokens = [t.strip().upper() for t in re.split(r"[,;/|、]+", str(candidate.get("positionValue") or ""))]
        rank = tokens.index("GK")+1 if "GK" in tokens else 0
        position = 1. if rank == 1 else .75 if rank == 2 else .55 if rank else 0.
        minute = min(1., candidate["minutes"]/max(1., reliability_minutes))
        coverage = sum(covers.values())/8
        confidence = coverage*minute*position
        results[index] = {"enabled": True, "kind": "goalkeeper", "label": label, "status": status,
            "primaryRoleId": first["roleId"] if first else "", "primaryName": first["name"] if first else "",
            "secondaryRoleId": second["roleId"] if second else "", "secondaryName": second["name"] if second else "",
            "margin": margin, "probabilityGap": margin/100, "relativeSeparation": margin/max(1., first["score"]) if first else 0.,
            "decisionStrength": min(1., margin/20), "roleClarity": min(1., margin/20),
            "dataConfidence": confidence, "confidence": confidence, "coverage": coverage,
            "minuteReliability": minute, "positionReliability": position,
            "positionContext": f"GK为第{rank}位置" if rank else "缺少GK记录",
            "denominatorMode": "门将专属每90分钟与传球结构比例，不套用外场总行动分母",
            "classificationNote": "Research行为代理：射门负荷与球队环境相关；不证明扑救质量、门线站位、受压出球或清道夫能力。",
            "fits": fits, "pillars": rows}
    return results
