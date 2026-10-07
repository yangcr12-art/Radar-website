from __future__ import annotations

from typing import Any


CATALOG_VERSION = "role-library-v2-cn"


def M(column: str, weight: float, direction: str = "higher", **extra: Any) -> dict[str, Any]:
    return {"column": column, "weight": weight, "direction": direction, **extra}


def GX(weight: float) -> dict[str, Any]:
    return M(
        "Goal - xG per 90",
        weight,
        label="Goal − xG（每90分钟）",
        derived={"operation": "subtract", "columns": ["Goals per 90", "xG per 90"]},
        note="全部进球/90减去xG/90，用于衡量总体实际进球相对总体预期进球的超额表现。",
    )


def FORWARD_PASS_SHARE(weight: float) -> dict[str, Any]:
    return M(
        "Forward passes share, %",
        weight,
        label="向前传球占总传球比例（%）",
        derived={"operation": "ratio_percent", "columns": ["Forward passes per 90", "Passes per 90"]},
        note="向前传球/90除以全部传球/90再乘100；总传球为0或缺失时按该指标缺失处理。",
    )


def POSSESSION_LOSSES_PER_90(weight: float) -> dict[str, Any]:
    return M(
        "Losses per 90",
        weight,
        "lower",
        label="每90分钟球权丢失（缺列时估算）",
        fallbackDerived={
            "operation": "volume_times_failure_rate",
            "columns": ["Passes per 90", "Accurate passes, %"],
        },
        note=(
            "优先读取源表Losses per 90；当前源表缺列时使用"
            "Passes per 90 ×（100 − Accurate passes, %）÷ 100估算传球失误。"
            "估算值不包含盘带、接球等其他失去球权方式。"
        ),
    )


def D(identifier: str, name: str, *metrics: dict[str, Any]) -> dict[str, Any]:
    return {"id": identifier, "name": name, "weight": round(sum(float(item["weight"]) for item in metrics), 10), "metrics": list(metrics)}


def R(
    identifier: str,
    name: str,
    family: str,
    description: str,
    positions: list[str],
    *dimensions: dict[str, Any],
    foot_mode: str = "none",
    catalog_visible: bool = True,
    version: str | None = None,
) -> dict[str, Any]:
    return {
        "id": identifier,
        "version": version or CATALOG_VERSION,
        "name": name,
        "family": family,
        "qualityLevel": "Research",
        "description": description,
        "positionTokens": positions,
        "footMode": foot_mode,
        "catalogVisible": catalog_visible,
        "dimensions": list(dimensions),
        "notScored": [],
    }


# 职责模型是可审计的显式配置：每项指标权重相加为维度权重，每个职责总和为 100。
ADDITIONAL_SCOUTING_MODELS: list[dict[str, Any]] = [
    R(
        "target_forward", "支点中锋", "中锋", "以背身接应、承接长传、空中对抗和快速做球为核心；对应此前的站桩中锋。", ["CF"],
        D("aerial_physical", "制空与对抗", M("Duels per 90", 7), M("Duels won, %", 9), M("Aerial duels per 90", 10), M("Aerial duels won, %", 9), M("Fouls suffered per 90", 5)),
        D("finishing", "禁区终结", M("Non-penalty goals per 90", 7), GX(5), M("Head goals per 90", 10), M("Shots per 90", 3), M("Goal conversion, %", 5)),
        D("link_play", "支点连接", M("Shot assists per 90", 4), M("xA per 90", 5), M("Dribbles per 90", 6), M("Successful dribbles, %", 5)),
        D("fitness_defense", "体能与防守", M("Successful defensive actions per 90", 4), M("Total Distance per 90", 4), M("Max Speed (km/h)", 2)),
        version="target-forward-v3-capability",
    ),
    R(
        "poacher", "抢点型前锋", "中锋", "以禁区内无球到位、射门质量与机会转化为核心。", ["CF"],
        D("finishing", "终结效率", M("Non-penalty goals per 90", 13), GX(10), M("Shots per 90", 10), M("Shots on target, %", 8), M("Goal conversion, %", 9)),
        D("movement", "无球到位与禁区占位", M("Touches in box per 90", 8), M("Accelerations per 90", 5), M("Sprinting Distance per 90 (+25 km/h)", 6), M("Max Speed (km/h)", 3), M("Progressive runs per 90", 3)),
        D("box_duels", "禁区对抗", M("Head goals per 90", 8), M("Aerial duels per 90", 4), M("Aerial duels won, %", 4), M("Offensive duels won, %", 2)),
        D("link_work", "连接与压迫", M("Shot assists per 90", 2), M("Successful defensive actions per 90", 3), M("Total Distance per 90", 2)),
        version="poacher-v3-capability",
    ),
    R(
        "power_forward", "冲击型前锋", "中锋", "强调身体对抗、冲刺爆发、纵深推进与直接威胁。", ["CF"],
        D("power", "力量对抗", M("Duels per 90", 5), M("Duels won, %", 6), M("Aerial duels per 90", 5), M("Aerial duels won, %", 6), M("Offensive duels won, %", 8)),
        D("pace", "速度爆发", M("Sprinting Distance per 90 (+25 km/h)", 8), M("Max Speed (km/h)", 7), M("Accelerations per 90", 5), M("Progressive runs per 90", 5)),
        D("threat", "冲击终结", M("Non-penalty goals per 90", 9), GX(6), M("Shots per 90", 6), M("Touches in box per 90", 6), M("Shots on target, %", 4), M("Goal conversion, %", 4)),
        D("work_link", "跑动连接", M("Successful defensive actions per 90", 2), M("Total Distance per 90", 3), M("Fouls suffered per 90", 3), M("Shot assists per 90", 2)),
        version="power-forward-v3-capability",
    ),
    R(
        "complete_forward", "全能前锋", "中锋", "职责广度型前锋：参与终结、支点、回撤连接、纵深冲击和机会创造，不要求每一项都达到高水平。", ["CF"],
        D("scoring", "得分威胁", M("Non-penalty goals per 90", 7), GX(5), M("Shots per 90", 4), M("Touches in box per 90", 4), M("Shots on target, %", 3), M("Goal conversion, %", 3), M("Head goals per 90", 4)),
        D("link", "连接创造", M("xA per 90", 5), M("Key passes per 90", 4), M("Shot assists per 90", 4), FORWARD_PASS_SHARE(4), M("Progressive passes per 90", 5), M("Passes to penalty area per 90", 5)),
        D("physical", "身体对抗", M("Duels per 90", 3), M("Duels won, %", 4), M("Aerial duels per 90", 3), M("Aerial duels won, %", 4), M("Offensive duels won, %", 3), M("Fouls suffered per 90", 3)),
        D("progression", "推进冲击", M("Dribbles per 90", 4), M("Successful dribbles, %", 3), M("Progressive runs per 90", 4), M("Accelerations per 90", 2), M("Sprinting Distance per 90 (+25 km/h)", 2)),
        D("work", "防守跑动", M("Successful defensive actions per 90", 5), M("Total Distance per 90", 3)),
        version="complete-forward-v3-capability",
    ),
    R(
        "playmaking_forward", "组织型前锋", "中锋", "通过回撤组织、持球推进和机会创造主导前场连接，同时保留必要的身体对抗与禁区终结。", ["CF", "AMF"],
        D("creation", "机会创造", M("xA per 90", 9), M("Key passes per 90", 8), M("Shot assists per 90", 3), M("Smart passes per 90", 2), M("Through passes per 90", 2), M("Passes to penalty area per 90", 6)),
        D("link_progression", "回撤组织与推进", M("Progressive passes per 90", 4), M("Progressive runs per 90", 4), M("Dribbles per 90", 6), M("Successful dribbles, %", 4), M("Successful attacking actions per 90", 3), FORWARD_PASS_SHARE(4), M("Fouls suffered per 90", 2)),
        D("physical", "身体对抗", M("Duels per 90", 4), M("Duels won, %", 5), M("Aerial duels per 90", 4), M("Aerial duels won, %", 5), M("Offensive duels won, %", 2)),
        D("press", "前场防守", M("Successful defensive actions per 90", 5), M("Total Distance per 90", 3)),
        D("threat", "禁区终结", M("Non-penalty goals per 90", 5), GX(4), M("Shots per 90", 3), M("Touches in box per 90", 3)),
        version="playmaking-forward-v4-capability",
    ),
    R(
        "traditional_touchline_winger", "顺足下底边锋", "边锋", "同侧顺足活动、突破下底并持续制造高质量传中。", ["RW", "RWF", "RAMF", "LW", "LWF", "LAMF"],
        D("physical", "身体对抗", M("Duels per 90", 2), M("Duels won, %", 4), M("Aerial duels per 90", 1), M("Aerial duels won, %", 1), M("Fouls suffered per 90", 4)),
        D("inside_scoring", "内切得分威胁", M("Non-penalty goals per 90", 2), GX(1), M("Shots per 90", 2), M("Goal conversion, %", 1), M("Shots on target, %", 2)),
        D("one_v_one", "一对一突破", M("Dribbles per 90", 5), M("Successful dribbles, %", 4), M("Offensive duels per 90", 3), M("Offensive duels won, %", 2), M("Successful attacking actions per 90", 3), M("Accelerations per 90", 4), M("Touches in box per 90", 4, note="当前源表缺少持球攻入禁区字段，暂以禁区触球作为禁区进入代理。")),
        D("progression_delivery", "纵深推进与边路输出", M("Progressive runs per 90", 8), M("Max Speed (km/h)", 4), M("Crosses per 90", 7), M("Accurate crosses, %", 6), M("Crosses to goalie box per 90", 6), M("Deep completed crosses per 90", 6)),
        D("creation", "机会创造", M("xA per 90", 4), M("Key passes per 90", 3), M("Shot assists per 90", 4), M("Passes to penalty area per 90", 3), M("Progressive passes per 90", 3), M("Corners per 90", 0.5), M("Free kicks per 90", 0.5)),
        foot_mode="natural_wide",
        version="touchline-winger-v3-five-dimensions",
    ),
    R(
        "dribbling_winger", "内锋", "边锋", "从边路向禁区和中路攻击，以持球突破、纵深推进和自主终结制造威胁。", ["RW", "RWF", "RAMF", "LW", "LWF", "LAMF"],
        D("physical", "身体对抗", M("Duels per 90", 3), M("Duels won, %", 5), M("Aerial duels per 90", 1), M("Aerial duels won, %", 1), M("Fouls suffered per 90", 5)),
        D("inside_scoring", "内切得分威胁", M("Non-penalty goals per 90", 11), GX(8), M("Shots per 90", 7), M("Goal conversion, %", 7), M("Shots on target, %", 7)),
        D("one_v_one", "一对一突破", M("Dribbles per 90", 3), M("Successful dribbles, %", 3), M("Offensive duels per 90", 2), M("Offensive duels won, %", 2), M("Successful attacking actions per 90", 3), M("Accelerations per 90", 2), M("Touches in box per 90", 3, note="当前源表缺少持球攻入禁区字段，暂以禁区触球作为禁区进入代理。")),
        D("progression_delivery", "纵深推进与边路输出", M("Progressive runs per 90", 5), M("Max Speed (km/h)", 3), M("Crosses per 90", 2), M("Accurate crosses, %", 2), M("Crosses to goalie box per 90", 3), M("Deep completed crosses per 90", 2)),
        D("creation", "机会创造", M("xA per 90", 3), M("Key passes per 90", 2), M("Shot assists per 90", 2), M("Passes to penalty area per 90", 1.5), M("Progressive passes per 90", 1), M("Corners per 90", 0.25), M("Free kicks per 90", 0.25)),
        version="inside-forward-v3-five-dimensions",
    ),
    R(
        "winger_wide_playmaker", "组织型边锋", "边锋", "从边路接球后向内组织，重视最后一传、控球连接与肋部推进。", ["RW", "RWF", "RAMF", "LW", "LWF", "LAMF"],
        D("physical", "身体对抗", M("Duels per 90", 2), M("Duels won, %", 4), M("Aerial duels per 90", 1), M("Aerial duels won, %", 1), M("Fouls suffered per 90", 4)),
        D("inside_scoring", "内切得分威胁", M("Non-penalty goals per 90", 4), GX(3), M("Shots per 90", 3), M("Goal conversion, %", 2), M("Shots on target, %", 3)),
        D("one_v_one", "一对一突破", M("Dribbles per 90", 4), M("Successful dribbles, %", 3), M("Offensive duels per 90", 2), M("Offensive duels won, %", 2), M("Successful attacking actions per 90", 3), M("Accelerations per 90", 2), M("Touches in box per 90", 3, note="当前源表缺少持球攻入禁区字段，暂以禁区触球作为禁区进入代理。")),
        D("progression_delivery", "纵深推进与边路输出", M("Progressive runs per 90", 5), M("Max Speed (km/h)", 3), M("Crosses per 90", 3), M("Accurate crosses, %", 2), M("Crosses to goalie box per 90", 3), M("Deep completed crosses per 90", 4)),
        D("creation", "机会创造", M("xA per 90", 8), M("Key passes per 90", 7), M("Shot assists per 90", 5), M("Passes to penalty area per 90", 5.6), M("Progressive passes per 90", 5), M("Corners per 90", 1.7), M("Free kicks per 90", 1.7)),
        version="playmaking-winger-v3-five-dimensions",
    ),
    R(
        "attacking_midfielder", "古典前腰", "前腰", "在锋线身后持续接应并控制进攻方向，以最后一传、穿透输送和二线威胁为主要能力。", ["AMF"],
        D("physical", "身体对抗", M("Duels per 90", 3), M("Duels won, %", 3), M("Aerial duels per 90", 2), M("Aerial duels won, %", 2), M("Fouls suffered per 90", 2)),
        D("creation", "创造组织", M("xA per 90", 8), M("Key passes per 90", 6), M("Shot assists per 90", 6), M("Smart passes per 90", 4), M("Through passes per 90", 3), M("Passes to penalty area per 90", 5), M("Deep completions per 90", 2)),
        D("passing_progression", "传控推进", M("Progressive passes per 90", 7), M("Passes to final third per 90", 4), FORWARD_PASS_SHARE(4), M("Received passes per 90", 4), M("Passes per 90", 3), M("Long passes per 90", 3)),
        D("carrying", "突破推进", M("Dribbles per 90", 4), M("Successful dribbles, %", 4), M("Progressive runs per 90", 3), M("Successful attacking actions per 90", 2), M("Accelerations per 90", 1)),
        D("threat", "二线得分", M("Non-penalty goals per 90", 4), GX(3), M("Shots per 90", 3), M("Touches in box per 90", 2), M("Shots on target, %", 1), M("Goal conversion, %", 2)),
        version="classic-ten-v4-five-dimensions",
    ),
    R(
        "shadow_striker", "影锋", "前腰", "从中锋身后攻击禁区与二点区域，以无球到位、连续射门和二次终结为主要能力。", ["AMF"],
        D("physical", "身体对抗", M("Duels per 90", 4), M("Duels won, %", 4), M("Aerial duels per 90", 2), M("Aerial duels won, %", 3), M("Fouls suffered per 90", 2)),
        D("finishing", "禁区终结", M("Non-penalty goals per 90", 10), GX(7), M("Shots per 90", 6), M("Shots on target, %", 5), M("Goal conversion, %", 7)),
        D("movement", "无球到位", M("Touches in box per 90", 7), M("Accelerations per 90", 5), M("Progressive runs per 90", 4), M("Sprinting Distance per 90 (+25 km/h)", 3), M("Max Speed (km/h)", 2)),
        D("carrying_link", "持球突破与前场连接", M("Dribbles per 90", 5), M("Successful dribbles, %", 5), M("xA per 90", 2), M("Key passes per 90", 2), M("Shot assists per 90", 2), M("Passes to penalty area per 90", 3), M("Progressive passes per 90", 3)),
        D("press", "压迫跑动", M("Successful defensive actions per 90", 4), M("Total Distance per 90", 3)),
        version="shadow-striker-v4-five-dimensions",
    ),
    R(
        "attacking_mid_wide_playmaker", "边前腰", "前腰", "在边线与肋部之间接球，通过持球摆脱、边肋输送和最后一传组织进攻。", ["AMF"],
        D("physical", "身体对抗", M("Duels per 90", 3), M("Duels won, %", 3), M("Aerial duels per 90", 2), M("Aerial duels won, %", 2), M("Fouls suffered per 90", 2)),
        D("creation", "机会创造", M("xA per 90", 6), M("Key passes per 90", 5), M("Shot assists per 90", 4), M("Smart passes per 90", 2), M("Passes to penalty area per 90", 4), M("Through passes per 90", 2)),
        D("passing_progression", "传控推进", M("Progressive passes per 90", 6), M("Passes to final third per 90", 4), FORWARD_PASS_SHARE(4), M("Received passes per 90", 3), M("Long passes per 90", 3), M("Passes per 90", 2)),
        D("carrying_wide", "持球突破与肋部活动", M("Dribbles per 90", 4), M("Successful dribbles, %", 3), M("Progressive runs per 90", 4), M("Successful attacking actions per 90", 3), M("Accelerations per 90", 2), M("Crosses per 90", 5), M("Accurate crosses, %", 4), M("Crosses to goalie box per 90", 3), M("Deep completed crosses per 90", 3)),
        D("threat", "得分威胁", M("Non-penalty goals per 90", 3), GX(2), M("Shots per 90", 3), M("Touches in box per 90", 1), M("Shots on target, %", 1), M("Goal conversion, %", 2)),
        version="wide-ten-v4-five-dimensions",
    ),
    R(
        "deep_lying_playmaker", "拖后组织者", "后腰", "从较深位置持续接应并控制第一阶段出球，以长传调度、向前输送和防守保护连接后场与中场。", ["DMF", "RDMF", "LDMF"],
        D("physical", "身体对抗", M("Duels per 90", 4), M("Duels won, %", 4), M("Aerial duels per 90", 3), M("Aerial duels won, %", 4), M("Fouls suffered per 90", 5)),
        D("build_up", "后场调度", M("Passes per 90", 6), M("Accurate passes, %", 6), M("Received passes per 90", 5), M("Long passes per 90", 6), M("Accurate long passes, %", 5), M("Accurate short / medium passes, %", 4)),
        D("progression", "纵向输送", M("Progressive passes per 90", 7), FORWARD_PASS_SHARE(5), M("Accurate forward passes, %", 4), M("Passes to final third per 90", 4), M("Passes to penalty area per 90", 3), M("Through passes per 90", 3)),
        D("defense", "防守保护", M("Successful defensive actions per 90", 4), M("PAdj Interceptions", 4), M("Defensive duels per 90", 4), M("Defensive duels won, %", 4)),
        D("coverage", "无球覆盖", M("Total Distance per 90", 3), M("High Intensity Distance per 90", 3, label="每90分钟高强度距离（+20 km/h）")),
        version="deep-lying-playmaker-v3-five-dimensions",
    ),
    R(
        "ball_winning_midfielder", "防守型后腰", "后腰", "保护中路、主动对抗并夺回球权，同时维持必要的覆盖、纪律和后场调度。", ["DMF", "RDMF", "LDMF"],
        D("physical", "身体对抗", M("Duels per 90", 6), M("Duels won, %", 7), M("Aerial duels per 90", 5), M("Aerial duels won, %", 6), M("Fouls suffered per 90", 3)),
        D("ball_winning", "夺回球权", M("Successful defensive actions per 90", 10), M("Defensive duels per 90", 7), M("Defensive duels won, %", 7), M("PAdj Sliding tackles", 5), M("PAdj Interceptions", 6), M("Shots blocked per 90", 3)),
        D("coverage", "覆盖跑动", M("Total Distance per 90", 5), M("High Intensity Distance per 90", 4, label="每90分钟高强度距离（+20 km/h）"), M("Sprinting Distance per 90 (+25 km/h)", 3), M("Accelerations per 90", 3)),
        D("discipline", "防守纪律", M("Fouls per 90", 5, "lower"), M("Yellow cards per 90", 3, "lower"), M("Red cards per 90", 2, "lower")),
        D("distribution", "后场调度", M("Forward passes per 90", 4), M("Accurate passes, %", 2), M("Accurate long passes, %", 2), M("Progressive passes per 90", 2)),
        version="ball-winning-midfielder-v3-five-dimensions",
    ),
    R(
        "half_back", "半中卫", "后腰", "组织阶段回撤到两名中卫之间或侧旁形成临时三后卫，参与第一阶段出球，并在转换中承担防反保护。", ["DMF", "RDMF", "LDMF"],
        D("physical", "身体对抗", M("Duels per 90", 5), M("Duels won, %", 6), M("Aerial duels per 90", 4), M("Aerial duels won, %", 5), M("Fouls suffered per 90", 3)),
        D("build_up", "回撤出球", M("Passes per 90", 7), M("Accurate passes, %", 6), M("Received passes per 90", 5), M("Accurate short / medium passes, %", 5), M("Long passes per 90", 4)),
        D("defense", "防守", M("Successful defensive actions per 90", 8), M("PAdj Interceptions", 8), M("Defensive duels per 90", 6), M("Defensive duels won, %", 6), M("Shots blocked per 90", 2)),
        D("transition", "转换保护", M("Total Distance per 90", 5), M("High Intensity Distance per 90", 4, label="每90分钟高强度距离（+20 km/h）"), M("Max Speed (km/h)", 3)),
        D("security", "控球克制", POSSESSION_LOSSES_PER_90(4), FORWARD_PASS_SHARE(2), M("Progressive passes per 90", 2)),
        version="half-back-v3-five-dimensions",
    ),
    R(
        "box_to_box_midfielder", "全场覆盖型（B2B）中场", "中前卫", "高覆盖连接两端，在跑动、防守、推进和后插上之间保持平衡。", ["RCMF", "LCMF", "CMF"],
        D("physical", "身体对抗", M("Duels per 90", 5), M("Duels won, %", 6), M("Aerial duels per 90", 3), M("Aerial duels won, %", 3), M("Fouls suffered per 90", 1)),
        D("work", "全场覆盖", M("Total Distance per 90", 10), M("High Intensity Distance per 90", 7, label="每90分钟高强度距离（+20 km/h）"), M("Sprinting Distance per 90 (+25 km/h)", 4), M("Accelerations per 90", 4)),
        D("defense", "防守贡献", M("Successful defensive actions per 90", 8), M("PAdj Interceptions", 7), M("Defensive duels per 90", 7)),
        D("progression", "推进连接", M("Progressive runs per 90", 6), M("Progressive passes per 90", 6), M("Passes to final third per 90", 4), M("Dribbles per 90", 3), M("Successful dribbles, %", 3)),
        D("attack", "进攻参与", M("xA per 90", 4), M("Key passes per 90", 2), M("Shot assists per 90", 2), M("Non-penalty goals per 90", 2), M("Shots per 90", 3)),
        version="box-to-box-v3-refined-capability",
    ),
    R(
        "progressive_number_eight", "推进型中场", "中前卫", "通过带球与传球越线，持续把球送入前场和进攻三区。", ["RCMF", "LCMF", "CMF"],
        D("physical", "身体对抗", M("Duels per 90", 4), M("Duels won, %", 4), M("Aerial duels per 90", 2), M("Aerial duels won, %", 2), M("Fouls suffered per 90", 2)),
        D("progression", "推进穿线", M("Progressive runs per 90", 7), M("Progressive passes per 90", 7), M("Passes to final third per 90", 5), M("Passes to penalty area per 90", 4), M("Dribbles per 90", 4), M("Successful dribbles, %", 4), M("Accelerations per 90", 4)),
        D("creation", "机会创造", M("xA per 90", 6), M("Key passes per 90", 6), M("Shot assists per 90", 4), M("Smart passes per 90", 3), M("Through passes per 90", 3)),
        D("control", "中场控制", M("Passes per 90", 4), M("Accurate passes, %", 4), M("Received passes per 90", 3), M("Forward passes per 90", 4), M("Long passes per 90", 2)),
        D("threat", "二线威胁", M("Non-penalty goals per 90", 3), GX(3), M("Shots per 90", 2), M("Touches in box per 90", 2), M("Shots on target, %", 2)),
        version="progressive-eight-v3-refined-capability",
    ),
    R(
        "central_playmaker", "组织核心", "中前卫", "以高频接球和传导控制中场节奏，并通过向前传递持续创造推进与机会。", ["RCMF", "LCMF", "CMF"],
        D("physical", "身体对抗", M("Duels per 90", 3), M("Duels won, %", 3), M("Aerial duels per 90", 2), M("Aerial duels won, %", 2), M("Fouls suffered per 90", 2)),
        D("control", "控球调度", M("Passes per 90", 8), M("Accurate passes, %", 6), M("Received passes per 90", 6), M("Forward passes per 90", 5), M("Progressive passes per 90", 5), M("Long passes per 90", 4), M("Accurate long passes, %", 4)),
        D("creation", "机会创造", M("xA per 90", 5), M("Key passes per 90", 5), M("Shot assists per 90", 4), M("Smart passes per 90", 3), M("Through passes per 90", 3), M("Passes to penalty area per 90", 4)),
        D("progression", "推进组织", M("Progressive passes per 90", 6), M("Passes to final third per 90", 4), M("Progressive runs per 90", 3), M("Dribbles per 90", 3), M("Successful dribbles, %", 2)),
        D("pressure", "无球支持", M("Successful defensive actions per 90", 4), M("PAdj Interceptions", 2), M("Total Distance per 90", 2)),
        version="central-playmaker-v3-refined-capability",
    ),
    R(
        "defensive_fullback", "防守型边后卫", "边后卫", "优先守住边路与后点，强调单防、拦截、制空和恢复速度。", ["RB", "LB", "RWB", "LWB"],
        D("defense", "边路防守", M("Successful defensive actions per 90", 10), M("Defensive duels per 90", 8), M("Defensive duels won, %", 8), M("PAdj Interceptions", 8), M("PAdj Sliding tackles", 6), M("Shots blocked per 90", 5), M("Aerial duels won, %", 5)),
        D("physical", "身体对抗", M("Duels per 90", 5), M("Duels won, %", 6), M("Aerial duels per 90", 4), M("Total Distance per 90", 5)),
        D("build_up", "稳健出球", M("Passes per 90", 5), M("Accurate passes, %", 5), M("Long passes per 90", 3), M("Progressive passes per 90", 2)),
        D("recovery", "回追纪律", M("Sprinting Distance per 90 (+25 km/h)", 5), M("Max Speed (km/h)", 4), M("Accelerations per 90", 3), M("Fouls per 90", 3, "lower")),
    ),
    R(
        "attacking_wingback", "进攻型边后卫（边翼卫）", "边后卫", "提供宽度、推进和传中，同时保留必要的回防贡献。", ["RB", "LB", "RWB", "LWB"],
        D("delivery", "边路创造", M("Crosses per 90", 8), M("Accurate crosses, %", 7), M("Shot assists per 90", 5), M("xA per 90", 5), M("Crosses to goalie box per 90", 4), M("Passes to penalty area per 90", 5)),
        D("progression", "持球推进", M("Progressive runs per 90", 7), M("Dribbles per 90", 6), M("Successful dribbles, %", 4), M("Progressive passes per 90", 5), M("Accelerations per 90", 4)),
        D("work", "往返能力", M("Total Distance per 90", 6), M("Sprinting Distance per 90 (+25 km/h)", 5), M("Max Speed (km/h)", 3), M("Successful defensive actions per 90", 4)),
        D("defense", "防守质量", M("Defensive duels per 90", 5), M("Defensive duels won, %", 5), M("PAdj Interceptions", 4)),
        D("threat", "后插上威胁", M("Non-penalty goals per 90", 2), M("Shots per 90", 2), M("Touches in box per 90", 2), M("Shots on target, %", 2)),
    ),
    R(
        "inverted_fullback", "内收型边后卫", "边后卫", "进入中场参与控球和反抢，重视向前传递、抗压推进与位置保护。", ["RB", "LB", "RWB", "LWB"],
        D("build_up", "中路组织", M("Passes per 90", 7), M("Accurate passes, %", 6), M("Accurate short / medium passes, %", 5), M("Forward passes per 90", 5), M("Progressive passes per 90", 7), M("Passes to final third per 90", 5), M("Long passes per 90", 3)),
        D("progression", "内线推进", M("Progressive runs per 90", 6), M("Dribbles per 90", 4), M("Successful dribbles, %", 4), M("Passes to penalty area per 90", 4), M("Received passes per 90", 3), M("Accelerations per 90", 3)),
        D("defense", "中路保护", M("Successful defensive actions per 90", 6), M("Defensive duels per 90", 5), M("Defensive duels won, %", 5), M("PAdj Interceptions", 5), M("PAdj Sliding tackles", 3)),
        D("work", "跑动对抗", M("Total Distance per 90", 5), M("Sprinting Distance per 90 (+25 km/h)", 3), M("Max Speed (km/h)", 3), M("Duels won, %", 3)),
    ),
    R(
        "front_foot_centre_back", "上抢型中卫", "中卫", "主动离开防线施压，强调对抗、拦截、抢断和身后恢复。", ["CB", "RCB", "LCB"],
        D("proactive_defense", "主动防守", M("Successful defensive actions per 90", 10), M("Defensive duels per 90", 8), M("Defensive duels won, %", 7), M("PAdj Interceptions", 8), M("PAdj Sliding tackles", 5), M("Shots blocked per 90", 4), M("Fouls per 90", 3, "lower")),
        D("aerial", "制空对抗", M("Aerial duels per 90", 6), M("Aerial duels won, %", 8), M("Head goals per 90", 2), M("Duels won, %", 6)),
        D("build", "基础出球", M("Passes per 90", 5), M("Accurate passes, %", 5), M("Forward passes per 90", 4), M("Progressive passes per 90", 4)),
        D("recovery", "恢复能力", M("Sprinting Distance per 90 (+25 km/h)", 5), M("Max Speed (km/h)", 5), M("Accelerations per 90", 2), M("Total Distance per 90", 3)),
    ),
    R(
        "ball_playing_centre_back", "出球型中卫", "中卫", "从后场稳定控球并穿透第一线，同时维持可靠防守。", ["CB", "RCB", "LCB"],
        D("build", "后场出球", M("Passes per 90", 8), M("Accurate passes, %", 7), M("Forward passes per 90", 6), M("Accurate forward passes, %", 4), M("Long passes per 90", 6), M("Accurate long passes, %", 5), M("Progressive passes per 90", 6), M("Average pass length, m", 3)),
        D("defense", "防守稳定", M("Successful defensive actions per 90", 7), M("Defensive duels per 90", 5), M("Defensive duels won, %", 6), M("PAdj Interceptions", 6), M("Shots blocked per 90", 3), M("PAdj Sliding tackles", 3)),
        D("aerial", "制空能力", M("Aerial duels per 90", 5), M("Aerial duels won, %", 7), M("Duels won, %", 3)),
        D("recovery", "身后恢复", M("Max Speed (km/h)", 4), M("Sprinting Distance per 90 (+25 km/h)", 3), M("Total Distance per 90", 3)),
    ),
    R(
        "cover_centre_back", "拖后型中卫", "中卫", "保护防线身后，以预判、回追、制空和低风险防守为核心。", ["CB", "RCB", "LCB"],
        D("recovery", "身后保护", M("Max Speed (km/h)", 8), M("Sprinting Distance per 90 (+25 km/h)", 7), M("Accelerations per 90", 5), M("PAdj Interceptions", 6), M("Total Distance per 90", 4)),
        D("defense", "防守稳定", M("Successful defensive actions per 90", 8), M("Defensive duels per 90", 6), M("Defensive duels won, %", 7), M("Shots blocked per 90", 5), M("PAdj Sliding tackles", 4), M("Fouls per 90", 3, "lower"), M("Red cards per 90", 2, "lower")),
        D("aerial", "制空能力", M("Aerial duels per 90", 6), M("Aerial duels won, %", 8), M("Duels won, %", 6)),
        D("build", "安全出球", M("Passes per 90", 5), M("Accurate passes, %", 5), M("Long passes per 90", 3), M("Progressive passes per 90", 2)),
    ),
    R(
        "shot_stopping_goalkeeper", "扑救型门将", "门将", "以扑救效率、阻止进球和控制失球为首要目标。", ["GK"],
        D("saves", "扑救表现", M("Save rate, %", 25), M("Prevented goals per 90", 25), M("Conceded goals per 90", 15, "lower")),
        D("command", "禁区控制", M("Exits per 90", 10), M("Aerial duels per 90", 10)),
        D("distribution", "基础出球", M("Long passes per 90", 5), M("Accurate long passes, %", 5), M("Passes per 90", 3), M("Accurate passes, %", 2)),
    ),
    R(
        "sweeper_keeper", "出击型门将", "门将", "主动处理禁区外和身后球，并兼顾扑救与长距离覆盖。", ["GK"],
        D("sweeping", "出击覆盖", M("Exits per 90", 15), M("Aerial duels per 90", 10), M("Back passes received as GK per 90", 8), M("Max Speed (km/h)", 4), M("Sprinting Distance per 90 (+25 km/h)", 3)),
        D("saves", "扑救保障", M("Save rate, %", 12), M("Prevented goals per 90", 12), M("Conceded goals per 90", 6, "lower")),
        D("distribution", "快速发起", M("Passes per 90", 6), M("Accurate passes, %", 6), M("Long passes per 90", 6), M("Accurate long passes, %", 6), M("Average pass length, m", 6)),
        catalog_visible=False,
    ),
    R(
        "ball_playing_goalkeeper", "出球型门将", "门将", "作为后场第一出球点，强调接应、传球量、准确度和长传质量。", ["GK"],
        D("distribution", "后场组织", M("Back passes received as GK per 90", 10), M("Passes per 90", 10), M("Accurate passes, %", 10), M("Long passes per 90", 10), M("Accurate long passes, %", 10), M("Average pass length, m", 5)),
        D("sweeping", "出击接应", M("Exits per 90", 8), M("Aerial duels per 90", 6), M("Max Speed (km/h)", 3), M("Sprinting Distance per 90 (+25 km/h)", 3)),
        D("saves", "扑救保障", M("Save rate, %", 10), M("Prevented goals per 90", 10), M("Conceded goals per 90", 5, "lower")),
    ),
]


def validate_catalog() -> None:
    ids: set[str] = set()
    for model in ADDITIONAL_SCOUTING_MODELS:
        if model["id"] in ids:
            raise ValueError(f"duplicate scouting model id: {model['id']}")
        ids.add(model["id"])
        dimension_total = sum(float(dimension["weight"]) for dimension in model["dimensions"])
        if abs(dimension_total - 100.0) > 1e-9:
            raise ValueError(f"model {model['id']} weights total {dimension_total}, expected 100")
        for dimension in model["dimensions"]:
            metric_total = sum(float(metric["weight"]) for metric in dimension["metrics"])
            if abs(metric_total - float(dimension["weight"])) > 1e-9:
                raise ValueError(f"dimension {model['id']}/{dimension['id']} has inconsistent weights")


validate_catalog()
