from __future__ import annotations

import re
from math import sqrt
from typing import Any, Callable

from server_core.services.percentile_service import percentile_pair

MIN_ANALYSIS_COHORT = 8
ROLE_ASSIGNMENT_FLOOR = 45.0
ROLE_CLEAR_SCORE = 60.0
ROLE_CLEAR_GAP = 5.0
DUAL_ROLE_HIGH_SCORE = 70.0
DUAL_ROLE_HIGH_MAX_GAP = 3.0
DUAL_ROLE_SOLID_SCORE = 65.0
DUAL_ROLE_SOLID_MAX_GAP = 2.0

EVENT_COLUMNS = {
    "duels": "Duels per 90", "aerial_duels": "Aerial duels per 90",
    "defensive_duels": "Defensive duels per 90", "successful_defensive_actions": "Successful defensive actions per 90",
    "shots_blocked": "Shots blocked per 90", "fouls_suffered": "Fouls suffered per 90",
    "passes": "Passes per 90", "received_passes": "Received passes per 90", "long_passes": "Long passes per 90",
    "progressive_passes": "Progressive passes per 90", "forward_passes": "Forward passes per 90",
    "final_third_passes": "Passes to final third per 90", "dribbles": "Dribbles per 90",
    "shots": "Shots per 90", "accelerations": "Accelerations per 90",
    "progressive_runs": "Progressive runs per 90", "crosses": "Crosses per 90",
    "goalie_box_crosses": "Crosses to goalie box per 90", "offensive_duels": "Offensive duels per 90",
    "key_passes": "Key passes per 90", "shot_assists": "Shot assists per 90",
    "penalty_area_passes": "Passes to penalty area per 90",
}
DIRECT_COLUMNS = {
    "PAdj Interceptions", "PAdj Sliding tackles", "Total Distance per 90",
    "High Intensity Distance per 90", "Sprinting Distance per 90 (+25 km/h)",
    "Max Speed (km/h)", "Average pass length, m",
}
DEFENDER_ANALYSIS_COLUMNS = {*EVENT_COLUMNS.values(), *DIRECT_COLUMNS, "Total actions per 90", "Total actions"}

def P(name: str, description: str, **features: float) -> dict[str, Any]:
    return {"name": name, "description": description, "features": features}

FULLBACK_PILLARS = {
    "physical": P("身体参与", "身体接触与高空球参与频率，完成质量由能力分评价。",
                  **{"event:duels": .45, "event:aerial_duels": .30, "event:fouls_suffered": .25}),
    "defense": P("边路防守", "衡量争抢、拦截与抢断参与；聚合数据不能确认争抢发生在哪条边路。",
                 **{"event:defensive_duels": .30, "event:successful_defensive_actions": .40, "direct:PAdj Interceptions": .20, "direct:PAdj Sliding tackles": .10}),
    "delivery": P("传中输出", "衡量提供宽度和输送禁区的行为频率。",
                  **{"event:crosses": .70, "event:goalie_box_crosses": .30}),
    "carrying": P("持球推进", "衡量个人带球出线与进攻对抗参与。",
                  **{"event:dribbles": .40, "event:progressive_runs": .40, "event:offensive_duels": .20}),
    "connection": P("接应组织", "衡量参与传接球和长短调度，作为内收参与的代理证据。",
                    **{"event:passes": .35, "event:received_passes": .30, "event:long_passes": .15, "ratio:long_pass_share": .20}),
    "progression": P("传球推进", "衡量向前输送与机会传递；并入原机会参与，避免替换支柱后丢失创造证据。",
                     **{"event:progressive_passes": .30, "event:final_third_passes": .20, "event:forward_passes": .10, "ratio:forward_pass_share": .20,
                        "event:key_passes": .10, "event:shot_assists": .05, "event:penalty_area_passes": .05}),
    "running": P("纵向往返", "衡量跑动负荷和启动倾向，速度只作为恢复与冲击的代理。",
                 **{"direct:Total Distance per 90": .25, "direct:High Intensity Distance per 90": .20, "direct:Sprinting Distance per 90 (+25 km/h)": .25, "event:accelerations": .20, "direct:Max Speed (km/h)": .10}),
    "wingback_compatibility": P("边翼卫位置支持", "翼卫记录的方向支持，不以位置数量判断强弱；绝对规则分，不代表已验证阵型。",
                  **{"position:wingback_compatibility": 1.0}),
}
CENTRE_BACK_PILLARS = {
    "contest": P("主动争抢", "衡量争抢与抢断频率；不代表已验证离开防线的上抢路径。",
                 **{"event:defensive_duels": .55, "direct:PAdj Sliding tackles": .25, "event:successful_defensive_actions": .20}),
    "interception": P("拦截保护", "衡量预判与阻断参与，不以低争抢量推断拖后职责。",
                      **{"direct:PAdj Interceptions": .65, "event:successful_defensive_actions": .35}),
    "box": P("禁区保护", "衡量封堵与空中争抢参与；缺少坐标时只作禁区保护代理。",
             **{"event:shots_blocked": .40, "event:aerial_duels": .35, "direct:PAdj Interceptions": .25}),
    "aerial": P("制空参与", "衡量高空球量及其在全部对抗中的占比，不读取成功率。",
                **{"event:aerial_duels": .60, "ratio:aerial_duel_share": .40}),
    "recovery": P("回追覆盖", "使用冲刺、加速和速度描述恢复条件；不能证明实际拖后站位。",
                  **{"direct:Sprinting Distance per 90 (+25 km/h)": .35, "event:accelerations": .25, "direct:Max Speed (km/h)": .25, "direct:Total Distance per 90": .15}),
    "connection": P("接应出球", "衡量后场传接球与长传调度参与。",
                    **{"event:passes": .35, "event:received_passes": .30, "event:long_passes": .20, "ratio:long_pass_share": .15}),
    "progression": P("推进出线", "传递推进占75%，原持球出线行为占25%；保留带球离开压力线的证据。",
                     **{"event:progressive_passes": .30, "event:final_third_passes": .20, "event:forward_passes": .10, "ratio:forward_pass_share": .15,
                        "event:progressive_runs": .15, "event:dribbles": .05, "event:offensive_duels": .05}),
    "wide_cb_compatibility": P("位置兼容性（不计分）", "CB确认居中兼容；同侧中卫与边后卫确认边中卫兼容。仅说明与筛选，不参与职责或可信度计分。",
                  **{"position:wide_cb_compatibility": 1.0}),
}

# components: (pillar or required geometric core, weight); these also generate the public method page.
FULLBACK_ROLES = {
    "defensive_fullback": {"name": "防守型边后卫", "core": ["defense"],
        "components": [("core", .65), ("physical", .20), ("connection", .15)],
        "boundary": "基础分乘防守主导系数；防守高于进攻参与10分时完整保留，持平保留75%，落后20分保留25%。缺少进攻对比字段时不确认防守主导。"},
    "attacking_wingback": {"name": "进攻型边后卫", "core": ["delivery", "carrying"],
        "components": [("core", .65), ("progression", .25), ("running", .10)],
        "boundary": "必须同时存在传中输出与持球推进；往返和向前机会输送作为辅助，不读取边翼卫兼容性。"},
    # Legacy ID retained for saved selections; public semantics are now balanced participation.
    "inverted_fullback": {"name": "攻守均衡型边后卫", "core": ["attack", "defense"],
        "components": [("core", .70), ("connection", .15), ("progression", .10), ("running", .05)],
        "coreMinimum": .40, "requiresObservedCore": True,
        "boundary": "进攻与防守参与各至少40分，差距至多20分；两端都有实质行动。组织接应与传球推进是辅助，不能补偿攻守短板；不判断内收站位。"},
    "wingback": {"name": "边翼卫", "core": ["delivery", "running"],
        "components": [("wingback_compatibility", .50), ("core", .30), ("carrying", .20)],
        "compatibilityKey": "wingback_compatibility", "compatibilityMinimum": .50, "coreMinimum": .40,
        "boundary": "位置支持最高占50%，乘行为支持系数后计入；仅FB加同侧边锋的位置代理须传中与往返核心至少60分，其余至少40分。翼卫与边后卫并存不直接决定主职责。"},
}
CENTRE_BACK_ROLES = {
    "front_foot_centre_back": {"name": "上抢型中卫", "core": ["contest", "interception"],
        "components": [("core", .65), ("aerial", .20), ("recovery", .15)],
        "boundary": "必要核心为主动争抢与拦截保护；需要录像确认是否主动离开防线施压。"},
    "cover_centre_back": {"name": "拖后型中卫", "core": ["interception", "box"],
        "components": [("core", .60), ("recovery", .25), ("aerial", .15)],
        "boundary": "必要核心为拦截保护与禁区保护；回追只作辅助，争抢少或速度快不直接判为拖后。"},
    "ball_playing_centre_back": {"name": "出球型中卫", "core": ["connection", "progression"],
        "components": [("core", .70), ("recovery", .15), ("interception", .15)],
        "boundary": "必须同时持续接应与向前输送；传球成功率用于能力分，传球量高不能单独替代推进行为。"},
}
DEFENDER_CONFIGS = {
    "边后卫": {"kind": "fullback", "tokens": ["RB", "LB", "RWB", "LWB"], "pillars": FULLBACK_PILLARS, "roles": FULLBACK_ROLES},
    "中卫": {"kind": "centre_back", "tokens": ["CB", "RCB", "LCB"], "pillars": CENTRE_BACK_PILLARS, "roles": CENTRE_BACK_ROLES},
}
DEFENDER_ROLE_IDS = {*FULLBACK_ROLES, *CENTRE_BACK_ROLES, "wide_centre_back"}  # legacy ability endpoint only

COMPATIBILITY_RULES = {
    "边后卫": ["翼卫加同侧边锋：100分位置支持；翼卫同侧没有边后卫、边锋记录：90分方向支持，不提高数据可信度。",
              "翼卫加同侧边后卫但无同侧边锋：65分，由行为区分翼卫与进攻型边后卫。",
              "没有翼卫标记，同侧边后卫加边锋：50分兼容推断，行为核心至少60分才参与标签。",
              "仅边后卫或跨侧兼容：20分，不参与边翼卫标签。多侧证据取最高规则分，不推算各位置分钟。"],
    "中卫": ["按本项目确认的源表编码，CB表示居中兼容；不推断出场占比或直接给拖后型加分。",
            "LB与LCB确认左侧边中卫兼容；RB与RCB确认右侧边中卫兼容；两组都满足则两侧兼容。",
            "CB与LB/RB但无同侧LCB/RCB只标记边中卫兼容待确认；跨侧或RWB与RCB不替代同侧配对。",
            "位置兼容性只用于说明与筛选，不参与三个职责评分、标签竞争或数据覆盖率；筛选不改变比较池或排名。"],
}

FEATURE_LABELS = {
    "duels": "对抗", "aerial_duels": "空中对抗", "defensive_duels": "防守对抗",
    "successful_defensive_actions": "成功防守动作", "shots_blocked": "封堵射门", "fouls_suffered": "被犯规",
    "passes": "传球", "received_passes": "接球", "long_passes": "长传", "progressive_passes": "推进传球",
    "forward_passes": "向前传球", "final_third_passes": "传入前场三区", "dribbles": "盘带",
    "shots": "射门", "accelerations": "加速", "progressive_runs": "推进跑动", "crosses": "传中",
    "goalie_box_crosses": "传入小禁区的传中", "offensive_duels": "进攻对抗", "key_passes": "关键传球",
    "shot_assists": "助攻射门传球", "penalty_area_passes": "传入禁区",
    "PAdj Interceptions": "PAdj 拦截", "PAdj Sliding tackles": "PAdj 滑铲",
    "Total Distance per 90": "每90分钟总距离", "High Intensity Distance per 90": "每90分钟高强度距离",
    "Sprinting Distance per 90 (+25 km/h)": "每90分钟冲刺距离", "Max Speed (km/h)": "最高速度",
    "Average pass length, m": "平均传球长度", "forward_pass_share": "向前传球占总传球比例",
    "long_pass_share": "长传占总传球比例", "aerial_duel_share": "空中对抗占全部对抗比例",
    "wingback_compatibility": "位置记录的边翼卫方向支持规则分", "wide_cb_compatibility": "位置记录的边中卫兼容性规则分",
}

FULLBACK_ATTACK_PATHS = {
    "偏边路输出": {"delivery": .55, "carrying": .45},
    "偏组织推进": {"connection": .35, "progression": .65},
}
FULLBACK_ATTACK_WEIGHTS = {"delivery": .40, "carrying": .35, "progression": .25}


def _fullback_attack_participation(pillars: dict[str, float]) -> float | None:
    if any(pillars.get(key) is None for key in FULLBACK_ATTACK_WEIGHTS):
        return None
    return sum(pillars[key] * weight for key, weight in FULLBACK_ATTACK_WEIGHTS.items())
ATTACK_STYLE_MIN_GAP = 10.0
ATTACK_STYLE_MIN_SCORE = 50.0
ATTACK_STYLE_MIN_COVERAGE = .50


def _fullback_attack_style(pillar_rows: list[dict[str, Any]], observed_pillars: set[str]) -> dict[str, Any]:
    """Read-only explanation: never fed back into role evidence or ability scoring."""
    rows = {row["id"]: row for row in pillar_rows}
    required = {key for weights in FULLBACK_ATTACK_PATHS.values() for key in weights}
    available = all(rows.get(key, {}).get("score") is not None
                    and rows[key]["coverage"] >= ATTACK_STYLE_MIN_COVERAGE for key in required)
    result = {"label": "", "available": available, "scores": {}, "gap": None,
              "note": "仅说明进攻路径，不参与职责相似度、能力分、可信度或排名。"}
    if not available:
        result["reason"] = "进攻路径字段不足，缺失不作低参与"
        return result
    result["scores"] = {name: sum(rows[key]["score"] * weight for key, weight in weights.items())
                        for name, weights in FULLBACK_ATTACK_PATHS.items()}
    ordered = sorted(result["scores"].items(), key=lambda item: -item[1])
    gap = ordered[0][1] - ordered[1][1]
    result["gap"] = gap
    if not required.issubset(observed_pillars):
        result["reason"] = "路径支柱缺少实质行动，不用中性并列百分位推断偏向"
    elif gap + 1e-9 < ATTACK_STYLE_MIN_GAP or ordered[0][1] < ATTACK_STYLE_MIN_SCORE:
        result["reason"] = "两条路径接近或参与程度不足，不强行显示偏向"
    else:
        result["label"] = ordered[0][0]
        result["reason"] = f"边路路径{result['scores']['偏边路输出']:.1f}分，组织路径{result['scores']['偏组织推进']:.1f}分，相差{gap:.1f}分"
    result["note"] = result["reason"] + "；" + result["note"]
    return result


def defender_method(family: str) -> dict[str, Any] | None:
    config = DEFENDER_CONFIGS.get(family)
    if not config:
        return None
    pillars = config["pillars"]
    pillar_names = {key: pillar["name"] for key, pillar in pillars.items()}
    pillar_names["attack"] = "进攻参与"
    rows = []
    for role_id, role in config["roles"].items():
        names = [pillar_names[key] for key in role["core"]]
        terms = []
        for key, weight in role["components"]:
            name = (names[0] if len(names) == 1 else f"√({'×'.join(names)})") if key == "core" else pillars[key]["name"]
            terms.append(f"{round(weight * 100)}%×{name}")
        compatibility_key = role.get("compatibilityKey")
        core_description = "与".join(names)
        if compatibility_key:
            core_description = f"{pillars[compatibility_key]['name']}至少{round(role['compatibilityMinimum'] * 100)}分；{core_description}几何核心至少40分且有实质行动"
        formula = " + ".join(terms)
        if role_id == "defensive_fullback":
            formula = f"（{formula}）×防守主导系数"
        elif role_id == "inverted_fullback":
            formula = f"（{formula}）×均衡系数"
            core_description += "；两端各至少40分，差距至多20分且有实质行动"
        elif role_id == "wingback":
            formula = "50%×边翼卫位置支持×行为支持系数 + 30%×√(传中输出×纵向往返) + 20%×持球推进"
            core_description += "；仅同侧FB加边锋的代理核心须至少60分"
        rows.append({"id": role_id, "name": role["name"], "core": core_description,
                     "support": "、".join(pillars[key]["name"] for key, _ in role["components"] if key not in {"core", compatibility_key}),
                     "formula": formula, "boundary": role["boundary"]})
    return {
        "family": family, "positionTokens": config["tokens"], "roles": rows,
        "compatibilityRules": COMPATIBILITY_RULES[family],
        "attackStyleRules": ([
            "；".join(name + " = " + " + ".join(f"{round(weight * 100)}%×{pillars[key]['name']}" for key, weight in weights.items())
                      for name, weights in FULLBACK_ATTACK_PATHS.items()),
            f"四个支柱均可用、各字段覆盖至少{ATTACK_STYLE_MIN_COVERAGE:.0%}且有实质行动，领先至少{ATTACK_STYLE_MIN_GAP:g}分且领先路径至少{ATTACK_STYLE_MIN_SCORE:g}分才显示偏向。职责数据不足或特征不突出时不显示。",
            "标签仅解释进攻方式，不参与职责相似度、能力分、可信度或排名，不重复奖励原指标。",
        ] if family == "边后卫" else []),
        "adjustmentRules": ([
            "进攻参与 = 40%×传中输出 + 35%×持球推进 + 25%×传球推进。防守主导差 = 边路防守 − 进攻参与。",
            "防守主导系数 = 25% + 75%×限制到0至1（（防守主导差 + 20分）÷30分）；只降低防守型匹配，不改变能力分。缺少任一对比支柱时保留基础诊断分，不确认防守型。",
            "翼卫行为核心 = √(传中输出×纵向往返)。行为支持系数 = 限制到0至1（（核心 − 20分）÷50分）；核心20分及以下位置贡献为0，70分及以上完整保留。",
            "翼卫行为分 = 60%×翼卫行为核心 + 40%×持球推进；与经过行为支持的位置贡献合成，不把位置记录直接当作标签。缺少核心不填零。",
            "攻守均衡型：进攻参与与边路防守形成几何核心；均衡系数 = 1 − 50%×min（1，攻守差距÷40分）。两端各至少40分且差距至多20分才竞争标签；攻守都低或单端极高不自动判均衡。接应组织与传球推进仍提供辅助证据。",
        ] if family == "边后卫" else []),
        "pillars": [{"id": key, "name": pillar["name"], "description": pillar["description"],
                     "metrics": [{"name": ("每90分钟" + FEATURE_LABELS[feature.split(":", 1)[1]]
                                 if feature.startswith("event:") else FEATURE_LABELS[feature.split(":", 1)[1]]),
                                  "weight": round(weight * 100)}
                                 for feature, weight in pillar["features"].items()]}
                    for key, pillar in pillars.items()],
    }

def _defender_role_evidence(pillars: dict[str, float], family: str) -> dict[str, dict[str, Any]]:
    pillars = dict(pillars)
    if family == "边后卫":
        attack = _fullback_attack_participation(pillars)
        if attack is not None:
            pillars["attack"] = attack
    evidence = {}
    for role_id, role in DEFENDER_CONFIGS[family]["roles"].items():
        core_values = [pillars.get(key) for key in role["core"]]
        core = (core_values[0] if len(core_values) == 1 else sqrt(core_values[0] * core_values[1])) if all(value is not None for value in core_values) else None
        components = [(key, core if key == "core" else pillars.get(key), weight) for key, weight in role["components"]]
        available = [(key, value, weight) for key, value, weight in components if value is not None]
        weight_sum = sum(weight for _, _, weight in available)
        score = sum(value * weight for _, value, weight in available) / weight_sum if weight_sum else None
        base_score = score
        adjustment_reason = "职责专属核心与辅助证据公式"
        comparison_available = True
        behavior_support = dominance = None
        balanced_enough = True
        if family == "边后卫" and role_id == "defensive_fullback":
            comparison_available = all(pillars.get(key) is not None for key in ("defense", "delivery", "carrying", "progression"))
            if comparison_available and score is not None:
                attack = pillars["attack"]
                dominance = pillars["defense"] - attack
                factor = .25 + .75 * max(0.0, min(1.0, (dominance + .20) / .30))
                score *= factor
                adjustment_reason = f"防守主导差{dominance * 100:.1f}分，基础匹配分保留{factor * 100:.0f}%"
            else:
                adjustment_reason = "进攻对比字段不足，保留基础诊断分，不确认防守主导"
        elif family == "边后卫" and role_id == "inverted_fullback":
            if core is not None:
                gap = abs(pillars["attack"] - pillars["defense"])
                factor = 1.0 - .50 * min(1.0, gap / .40)
                score *= factor
                balanced_enough = min(pillars["attack"], pillars["defense"]) >= .40 and gap <= .20 + 1e-9
                adjustment_reason = f"进攻参与{pillars['attack'] * 100:.1f}分、防守参与{pillars['defense'] * 100:.1f}分；差{gap * 100:.1f}分，均衡系数{factor * 100:.0f}%" + ("；两端各须至少40分且差不超过20分" if not balanced_enough else "")
            else:
                balanced_enough = False
                adjustment_reason = "攻守核心字段不足，不确认攻守均衡"
        elif family == "边后卫" and role_id == "wingback" and core is not None:
            behavior_support = max(0.0, min(1.0, (core - .20) / .50))
            # Only the position term is attenuated; retain the original available-weight denominator.
            score = sum(value * weight * (behavior_support if key == "wingback_compatibility" else 1.0)
                        for key, value, weight in available) / weight_sum
            adjustment_reason = f"翼卫位置贡献按行为核心支持{behavior_support * 100:.0f}%；位置不直接决定标签"
        compatibility_key = role.get("compatibilityKey")
        compatibility = pillars.get(compatibility_key) if compatibility_key else None
        structure_available = not compatibility_key or (compatibility is not None and compatibility >= role["compatibilityMinimum"])
        core_minimum = .60 if role_id == "wingback" and compatibility == .50 else role.get("coreMinimum", 0.0)
        evidence[role_id] = {"score": score, "baseScore": base_score, "coreScore": core,
                            "comparisonAvailable": comparison_available, "adjustmentReason": adjustment_reason,
                            "behaviorSupport": behavior_support, "defensiveDominance": dominance,
                            "coreMinimum": core_minimum,
                            "structureAvailable": structure_available,
                            "coreStrongEnough": core is not None and core >= core_minimum and balanced_enough,
                            "coverage": weight_sum, "coreAvailable": core is not None,
                            "components": [{"id": key, "value": value, "weight": weight, "available": value is not None}
                                           for key, value, weight in components]}
    return evidence

def _metric(raw: dict[str, Any], canonical: str, columns: dict[str, str], to_float: Callable[[Any], float | None]) -> float | None:
    column = columns.get(canonical, "")
    return to_float(raw.get(column)) if column else None


def _percentile_feature(values: dict[int, float]) -> dict[int, float]:
    if len(values) < MIN_ANALYSIS_COHORT:
        return {}
    sorted_values = sorted(values.values())
    return {index: percentile_pair(sorted_values, value, alpha=0.0)["rawPercentile"] / 100.0 for index, value in values.items()}


def _position_tokens(value: Any) -> list[str]:
    return [token.strip().upper() for token in re.split(r"[,;/|、]+", str(value or "")) if token.strip()]


def defender_compatibility(value: Any, family: str) -> dict[str, Any]:
    """Absolute, auditable position evidence; never percentile-ranked across players."""
    tokens = set(_position_tokens(value))
    if not tokens & set(DEFENDER_CONFIGS[family]["tokens"]):
        return {"score": None, "note": "缺少本位置族记录，兼容性不可用。", "completeSides": []}
    if family == "边后卫":
        supports = []
        sides = []
        for side, wb, fb, wings in [("left", "LWB", "LB", {"LW", "LWF"}), ("right", "RWB", "RB", {"RW", "RWF"})]:
            if wb in tokens:
                if tokens & wings:
                    supports.append((1.0, "翼卫与同侧边锋记录，方向明确支持边翼卫。"))
                    sides.append(side)
                elif fb in tokens:
                    supports.append((.65, "翼卫与同侧边后卫并存，需行为区分边翼卫和进攻型边后卫。"))
                    sides.append(side)
                else:
                    supports.append((.90, "明确翼卫记录，方向偏边翼卫；记录简略不等于数据更可信。"))
            elif fb in tokens and tokens & wings:
                supports.append((.50, "同侧边后卫与边锋兼容推断；无明确翼卫记录，需更强行为证据并人工复核。"))
        score, note = max(supports, key=lambda item: item[0]) if supports else (.20, "仅边后卫或跨侧位置，不据此确认边翼卫。")
    else:
        sides = [side for side, pair in (("left", {"LB", "LCB"}), ("right", {"RB", "RCB"})) if pair <= tokens]
        if sides:
            score, note = 1.0, "同侧中卫与边后卫兼容，结构证据完整。"
        elif "CB" in tokens and tokens & {"LB", "RB"}:
            score, note = .50, "居中中卫与边后卫兼容，但缺少同侧LCB/RCB记录，边中卫兼容待确认。"
        else:
            score, note = .20, "仅中卫或跨侧位置，不据此确认边中卫兼容。"
    return {"score": score, "note": note, "completeSides": sides}


def defender_model_eligible(role_id: str, value: Any) -> bool:
    """Explicit position identity evidence only; no longer an ability-list filter."""
    tokens = set(_position_tokens(value))
    if role_id == "wingback":
        return bool(tokens & {"LWB", "RWB"})
    if role_id == "wide_centre_back":
        return {"RB", "RCB"} <= tokens or {"LB", "LCB"} <= tokens
    return True


def defender_model_sides(role_id: str, value: Any) -> list[str] | None:
    """Side filters of identity entries only include that side's qualified identity."""
    tokens = set(_position_tokens(value))
    if role_id == "wingback":
        return [side for side, token in (("left", "LWB"), ("right", "RWB")) if token in tokens]
    if role_id == "wide_centre_back":
        return [side for side, pair in (("left", {"LB", "LCB"}), ("right", {"RB", "RCB"})) if pair <= tokens]
    return None


def defender_model_identity(role_id: str, value: Any) -> dict[str, Any]:
    sides = defender_model_sides(role_id, value)
    if sides is None:
        return {}
    names = {side: ("左" if side == "left" else "右") + ("边翼卫" if role_id == "wingback" else "侧边中卫") for side in sides}
    return {"qualifiedActivitySides": sides, "qualifiedIdentityBySide": names,
            "qualifiedPositionIdentity": "／".join(names.values()) + ("（两侧兼容）" if len(sides) > 1 else "")}


def defender_position_profile(value: Any, family: str, *, distinguishes_cb_sides: bool = False) -> dict[str, Any]:
    tokens = set(_position_tokens(value))
    identities: dict[str, str] = {}
    notes = ["位置记录仅证明位置兼容性；缺少各位置分钟，不推断主要活动侧或阵型。"]
    if family == "边后卫":
        for side, fb, wb, prefix in (("left", "LB", "LWB", "左"), ("right", "RB", "RWB", "右")):
            if wb in tokens or fb in tokens:
                identities[side] = prefix + ("边后卫／边翼卫" if {fb, wb} <= tokens else "边翼卫" if wb in tokens else "边后卫")
    else:
        for side, cb, fb, prefix in (("left", "LCB", "LB", "左侧"), ("right", "RCB", "RB", "右侧")):
            if cb in tokens:
                identities[side] = prefix + "中卫"
        if "CB" in tokens:
            identities["center"] = "居中中卫"
            notes.append("按本项目确认的源表编码，CB确认居中兼容；不据此判断拖后职责、主要出场位置或固定五后卫阵型。")
        if "CB" in tokens and tokens & {"RB", "LB"} and not defender_model_eligible("wide_centre_back", value):
            notes.append("兼容边后卫与中卫，但缺少同侧RCB/LCB证据，边中卫结构证据待复核。")
    sides = list(identities) or ["pending"]
    if not identities:
        identity = "中卫·侧别未注明" if family == "中卫" else "边后卫·侧别待确认"
    elif len(identities) == 1:
        identity = next(iter(identities.values()))
    else:
        identity = "／".join(identities.values()) + "（多位置兼容）"
    wide_sides = defender_model_sides("wide_centre_back", value) if family == "中卫" else []
    center = family == "中卫" and "CB" in tokens
    pending_wide = family == "中卫" and bool("CB" in tokens and tokens & {"LB", "RB"}) and not wide_sides
    labels = (["居中兼容"] if center else []) + ["兼容左侧边中卫" if side == "left" else "兼容右侧边中卫" for side in wide_sides]
    if pending_wide:
        labels.append("边中卫兼容待确认")
    return {"positionIdentity": identity, "identityBySide": identities, "activitySides": sides,
            "positionCompatibility": {"center": center, "wideSides": wide_sides, "pendingWide": pending_wide, "labels": labels},
            "positionProfile": " ".join(notes)}


def _position_context(candidate: dict[str, Any], config: dict[str, Any], family: str) -> dict[str, Any]:
    tokens = _position_tokens(candidate.get("positionValue"))
    ranks = [index + 1 for index, token in enumerate(tokens) if token in set(config["tokens"])]
    first_rank = min(ranks) if ranks else 0
    reliability = 1.0 if first_rank == 1 else 0.75 if first_rank == 2 else 0.55 if first_rank > 2 else 0.0
    label = f"{family}为第一位置" if first_rank == 1 else f"{family}为第二位置" if first_rank == 2 else f"{family}为第三及以后位置" if first_rank else f"缺少{family}位置记录"
    return {"reliability": reliability, "positionRank": first_rank, "label": label}


def build_defender_archetypes(
    candidates: list[dict[str, Any]],
    *,
    family: str,
    columns: dict[str, str],
    to_float: Callable[[Any], float | None],
    reliability_minutes: float,
) -> dict[int, dict[str, Any]]:
    config = DEFENDER_CONFIGS[family]
    distinguishes_cb_sides = any(set(_position_tokens(item.get("positionValue"))) & {"RCB", "LCB"} for item in candidates)
    pillar_specs = config["pillars"]
    role_names = {key: role["name"] for key, role in config["roles"].items()}
    raw_features: dict[str, dict[int, float]] = {}
    denominator_modes: dict[int, str] = {}
    total_actions_column = columns.get("Total actions per 90", "")
    total_actions_count_column = columns.get("Total actions", "")

    for index, candidate in enumerate(candidates):
        raw = candidate["raw"]
        event_values = {event_id: _metric(raw, canonical, columns, to_float) for event_id, canonical in EVENT_COLUMNS.items()}
        proxy_parts = [event_values.get(key) for key in ("duels", "passes", "shots", "dribbles")]
        provided_total = to_float(raw.get(total_actions_column)) if total_actions_column else None
        provided_total_count = to_float(raw.get(total_actions_count_column)) if total_actions_count_column else None
        valid_proxy_parts = [value for value in proxy_parts if value is not None and value >= 0]
        if provided_total is not None and provided_total > 0:
            denominator = provided_total
            denominator_modes[index] = "源表每90分钟总行动"
        elif provided_total_count is not None and provided_total_count > 0 and float(candidate["minutes"]) > 0:
            denominator = provided_total_count * 90.0 / float(candidate["minutes"])
            denominator_modes[index] = "源表总行动按分钟换算"
        elif len(valid_proxy_parts) >= 2 and sum(valid_proxy_parts) > 0:
            denominator = sum(valid_proxy_parts)
            denominator_modes[index] = "传球、对抗、盘带和射门代理总行动"
        else:
            denominator = None
            denominator_modes[index] = "行为量不足"

        for event_id, value in event_values.items():
            if value is None or value < 0:
                continue
            raw_features.setdefault(f"volume:{event_id}", {})[index] = value
            if denominator and denominator > 0:
                raw_features.setdefault(f"share:{event_id}", {})[index] = max(0.0, value / denominator)

        passes = event_values.get("passes")
        if passes is not None and passes > 0:
            forward_passes = event_values.get("forward_passes")
            long_passes = event_values.get("long_passes")
            if forward_passes is not None and forward_passes >= 0:
                raw_features.setdefault("ratio:forward_pass_share", {})[index] = forward_passes / passes
            if long_passes is not None and long_passes >= 0:
                raw_features.setdefault("ratio:long_pass_share", {})[index] = long_passes / passes

        duels = event_values.get("duels")
        aerial = event_values.get("aerial_duels")
        if duels is not None and duels > 0 and aerial is not None and aerial >= 0:
            raw_features.setdefault("ratio:aerial_duel_share", {})[index] = aerial / duels

        for canonical in DIRECT_COLUMNS:
            value = _metric(raw, canonical, columns, to_float)
            if value is not None and value >= 0:
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
        observed_pillars: set[str] = set()
        pillar_coverage_sum = 0.0
        compatibility = defender_compatibility(candidate.get("positionValue"), family)
        for pillar_id, pillar in pillar_specs.items():
            weighted = available_weight = coverage_weight = 0.0
            for feature, weight in pillar["features"].items():
                if feature.startswith("event:"):
                    event_id = feature.split(":", 1)[1]
                    percentile = event_scores.get(event_id, {}).get(index)
                    feature_coverage = event_coverages.get(event_id, {}).get(index, 0.0)
                elif feature.startswith("position:"):
                    percentile = compatibility["score"]
                    feature_coverage = 1.0 if percentile is not None else 0.0
                else:
                    percentile = feature_percentiles.get(feature, {}).get(index)
                    feature_coverage = 1.0 if percentile is not None else 0.0
                if percentile is None:
                    continue
                source_key = feature.replace("event:", "volume:", 1) if feature.startswith("event:") else feature
                if raw_features.get(source_key, {}).get(index, 0.0) > 0:
                    observed_pillars.add(pillar_id)
                weighted += float(weight) * percentile
                available_weight += float(weight)
                coverage_weight += float(weight) * feature_coverage
            score = weighted / available_weight if available_weight > 0 else None
            coverage = coverage_weight / sum(float(weight) for weight in pillar["features"].values())
            if family != "中卫" or pillar_id != "wide_cb_compatibility":
                pillar_coverage_sum += coverage
            if score is not None:
                pillar_values[pillar_id] = score
            pillar_rows.append({"id": pillar_id, "name": pillar["name"], "score": None if score is None or (family == "中卫" and pillar_id == "wide_cb_compatibility") else score * 100.0, "coverage": coverage})

        coverage = pillar_coverage_sum / (len(pillar_specs) - (1 if family == "中卫" else 0))
        if family == "边后卫" and any(key in observed_pillars for key in FULLBACK_ATTACK_WEIGHTS):
            observed_pillars.add("attack")
        context = _position_context(candidate, config, family)
        fits: list[dict[str, Any]] = []
        # Position evidence alone must not satisfy the four-behavior minimum.
        if sum(not key.endswith("compatibility") for key in pillar_values) >= 4:
            evidence_by_role = _defender_role_evidence(pillar_values, family)
            for role_id, name in role_names.items():
                evidence = evidence_by_role[role_id]
                evidence_score = evidence["score"]
                role = config["roles"][role_id]
                observed_core = not (role.get("compatibilityKey") or role.get("requiresObservedCore")) or all(key in observed_pillars for key in role["core"])
                eligible = evidence_score is not None and evidence["coreAvailable"] and evidence["coreStrongEnough"] and evidence["structureAvailable"] and evidence["comparisonAvailable"] and observed_core and float(evidence["coverage"]) >= 0.50
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
                    "distanceAdjustment": float(evidence.get("baseScore") or 0.0) - float(evidence_score or 0.0),
                    "adjustmentReason": evidence["adjustmentReason"],
                    "evidenceScore": evidence_score,
                    "evidenceCoverage": evidence["coverage"],
                    "evidenceComponents": evidence["components"],
                    "coreScore": None if evidence.get("coreScore") is None else 100.0 * float(evidence["coreScore"]),
                    "eligible": eligible,
                    "eligibilityReason": "" if eligible else "位置结构证据不足" if not evidence["structureAvailable"] else ("攻守两端须各至少40分且差至多20分" if role_id == "inverted_fullback" else f"必要行为核心低于{round(evidence['coreMinimum'] * 100)}分") if evidence["coreAvailable"] and not evidence["coreStrongEnough"] else "防守主导对比字段不足" if not evidence["comparisonAvailable"] else "必要核心未观察到实质行动" if evidence["coreAvailable"] and not observed_core else "必要核心缺失或职责相似度字段覆盖不足",
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
        position_profile = defender_position_profile(candidate.get("positionValue"), family, distinguishes_cb_sides=distinguishes_cb_sides)
        behavior_label = label.replace("型中卫", "型").replace("型边后卫", "型")
        results[index] = {
            "enabled": True,
            "classificationNote": (
                "攻守均衡表示进攻与防守都有明确参与，不代表两端能力都优秀；不再根据组织数据推断内收站位。"
                if family == "边后卫"
                else "上抢、拖后识别使用行动与回追条件代理，真实防线站位需录像复核。"
            ),
            **position_profile,
            "compatibilityEvidence": {**compatibility, "score": None if family == "中卫" or compatibility["score"] is None else compatibility["score"] * 100},
            "positionProfile": position_profile["positionProfile"] + " " + compatibility["note"],
            "behaviorLabel": behavior_label,
            "displayLabel": f"{position_profile['positionIdentity']}｜{behavior_label}",
            "kind": config["kind"],
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
        if family == "边后卫":
            style = _fullback_attack_style(pillar_rows, observed_pillars)
            if primary is None or float(primary["score"]) < ROLE_ASSIGNMENT_FLOOR:
                style["label"] = ""
                style["reason"] = "主职责数据不足或特征不突出，不显示进攻偏向"
                style["note"] = style["reason"] + "；仅说明进攻路径，不参与评分。"
            results[index]["attackStyle"] = style
    return results
