from __future__ import annotations

import unittest

from server_core.services.forward_role_analysis import (
    PILLAR_SPECS,
    _complete_forward_profile,
    _forward_position_context,
    _forward_role_evidence,
)
from server_core.services.scouting_model import (
    INVERTED_RIGHT_WINGER_MODEL,
    METRIC_ALIASES,
    SCOUTING_MODELS,
    _column_lookup,
    _metric_value,
    _resolve_metric,
    evaluate_inverted_right_winger,
    evaluate_scouting_role,
    list_scouting_models,
)
from server_core.services.percentile_algorithm import EVENT_NEGATIVE, STANDARD_NEGATIVE, default_percentile_algorithm
from server_core.services.winger_role_analysis import (
    INSIDE_FORWARD_EVIDENCE_WEIGHTS,
    INVERTED_EVIDENCE_WEIGHTS,
    PLAYMAKER_EVIDENCE_WEIGHTS,
    TOUCHLINE_EVIDENCE_WEIGHTS,
    WINGER_PILLAR_SPECS,
    _winger_role_evidence,
)
from server_core.services.attacking_midfielder_role_analysis import (
    ATTACKING_MIDFIELDER_ANALYSIS_COLUMNS,
    ATTACKING_MIDFIELDER_PILLAR_SPECS,
    CLASSIC_EVIDENCE_WEIGHTS,
    SHADOW_EVIDENCE_WEIGHTS,
    WIDE_TEN_EVIDENCE_WEIGHTS,
    _attacking_midfielder_role_evidence,
)
from server_core.services.central_midfielder_role_analysis import (
    B2B_EVIDENCE_WEIGHTS,
    CENTRAL_MIDFIELDER_ANALYSIS_COLUMNS,
    CENTRAL_MIDFIELDER_PILLAR_SPECS,
    PLAYMAKER_EVIDENCE_WEIGHTS as CENTRAL_PLAYMAKER_EVIDENCE_WEIGHTS,
    PROGRESSIVE_EVIDENCE_WEIGHTS,
    _central_midfielder_role_evidence,
)
from server_core.services.defensive_midfielder_role_analysis import (
    BALL_WINNER_EVIDENCE_WEIGHTS,
    DEEP_PLAYMAKER_EVIDENCE_WEIGHTS,
    DEFENSIVE_MIDFIELDER_ANALYSIS_COLUMNS,
    DEFENSIVE_MIDFIELDER_PILLAR_SPECS,
    HALF_BACK_EVIDENCE_WEIGHTS,
    _centre_back_compatibility,
    _defensive_midfielder_role_evidence,
)


def _all_metric_columns() -> list[str]:
    return [metric["column"] for dimension in INVERTED_RIGHT_WINGER_MODEL["dimensions"] for metric in dimension["metrics"]]


def _player(index: int, *, foot: str = "left", minutes: float = 900, matches: float = 10) -> dict:
    raw = {
        "Player": f"Player {index}",
        "Team": "Test Club",
        "Position": "RWF, RW",
        "Foot": foot,
        "Minutes played": minutes,
        "Matches played": matches,
    }
    for offset, dimension in enumerate(INVERTED_RIGHT_WINGER_MODEL["dimensions"], start=1):
        for metric in dimension["metrics"]:
            derived = metric.get("derived")
            if derived:
                source_columns = derived["columns"]
                raw[source_columns[0]] = float(index * 0.1 + offset * 0.01)
                raw[source_columns[1]] = float(index * 0.05 + offset * 0.005)
            else:
                raw[metric["column"]] = float(index * 10 + offset)
    return {"id": f"p{index}", "player": raw["Player"], "raw": raw}


def _doc(players: list[dict]) -> dict:
    columns = list(players[0]["raw"].keys())
    return {"source": {"filename": "test.xlsx"}, "schema": {"allColumns": columns}, "players": players}


class ScoutingModelTest(unittest.TestCase):
    def test_model_catalog_exposes_auditable_role_definitions(self):
        catalog = list_scouting_models()
        self.assertEqual(len(catalog), 26)
        self.assertEqual({model["family"] for model in catalog}, {"中锋", "边锋", "前腰", "中前卫", "后腰", "边后卫", "中卫", "门将"})
        expected_names = {
            "中锋": {"支点中锋", "抢点型前锋", "冲击型前锋", "全能前锋", "组织型前锋"},
            "边锋": {"逆足内切型边锋", "顺足下底边锋", "内锋", "组织型边锋"},
            "前腰": {"古典前腰", "影锋", "边前腰"},
            "中前卫": {"全场覆盖型（B2B）中场", "推进型中场", "组织核心"},
            "后腰": {"拖后组织者", "防守型后腰", "半中卫"},
            "边后卫": {"防守型边后卫", "进攻型边后卫（边翼卫）", "内收型边后卫"},
            "中卫": {"上抢型中卫", "出球型中卫", "拖后型中卫"},
            "门将": {"扑救型门将", "出球型门将"},
        }
        actual_names = {
            family: {model["name"] for model in catalog if model["family"] == family}
            for family in expected_names
        }
        self.assertEqual(actual_names, expected_names)
        self.assertEqual(
            [model["id"] for model in catalog if model["family"] == "中锋"],
            ["target_forward", "poacher", "power_forward", "playmaking_forward", "complete_forward"],
        )
        for model in catalog:
            self.assertTrue(model["positionTokens"])
            self.assertTrue(model["dimensions"])
            self.assertEqual(sum(dimension["weight"] for dimension in model["dimensions"]), 100)
            self.assertTrue(all(dimension["metrics"] for dimension in model["dimensions"]))

    def test_catalog_marks_effective_coupled_metrics_for_all_roles(self):
        catalog = {model["id"]: model for model in list_scouting_models()}
        target = catalog["target_forward"]
        physical = next(dimension for dimension in target["dimensions"] if dimension["name"] == "制空与对抗")
        coupled = {}
        for metric in physical["metrics"]:
            group_id = metric.get("coupledGroupId")
            if group_id:
                coupled.setdefault(group_id, []).append(metric)

        self.assertEqual(
            {group_id: sum(metric["weight"] for metric in metrics) for group_id, metrics in coupled.items()},
            {"duel_effectiveness": 16, "aerial_effectiveness": 19},
        )
        self.assertEqual(
            {metric["column"] for metric in coupled["duel_effectiveness"]},
            {"Duels per 90", "Duels won, %"},
        )
        self.assertTrue(all(metric["coupledGroupLabel"] == "对抗有效性（修正）" for metric in coupled["duel_effectiveness"]))
        self.assertTrue(all("贝叶斯" in metric["coupledFormula"] for metric in coupled["duel_effectiveness"]))
        self.assertTrue(all("同位置加权平均成功率" in metric["coupledBayesFormula"] for metric in coupled["duel_effectiveness"]))

        winger = catalog["inverted_right_winger_left_foot"]
        winger_coupled = {}
        for dimension in winger["dimensions"]:
            for metric in dimension["metrics"]:
                group_id = metric.get("coupledGroupId")
                if group_id:
                    winger_coupled.setdefault(group_id, []).append(metric)
        self.assertEqual(
            {group_id: sum(metric["weight"] for metric in metrics) for group_id, metrics in winger_coupled.items()},
            {
                "duel_effectiveness": 8,
                "aerial_effectiveness": 3,
                "finishing_effectiveness": 10,
                "dribble_effectiveness": 9,
                "offensive_duel_effectiveness": 5,
                "crossing_effectiveness": 3,
            },
        )

    def test_all_winger_roles_use_the_five_reviewed_dimensions(self):
        catalog = {model["id"]: model for model in list_scouting_models()}
        expected = {
            "inverted_right_winger_left_foot": [15, 30, 25, 12, 18],
            "traditional_touchline_winger": [12, 8, 25, 37, 18],
            "dribbling_winger": [15, 40, 18, 17, 10],
            "winger_wide_playmaker": [12, 15, 19, 20, 34],
        }
        expected_names = ["身体对抗", "内切得分威胁", "一对一突破", "纵深推进与边路输出", "机会创造"]
        for role_id, weights in expected.items():
            dimensions = catalog[role_id]["dimensions"]
            self.assertEqual([dimension["name"] for dimension in dimensions], expected_names)
            self.assertEqual([dimension["weight"] for dimension in dimensions], weights)

        playmaker_creation = catalog["winger_wide_playmaker"]["dimensions"][-1]
        set_piece_weight = sum(
            metric["weight"]
            for metric in playmaker_creation["metrics"]
            if metric["column"] in {"Corners per 90", "Free kicks per 90"}
        )
        self.assertAlmostEqual(set_piece_weight / playmaker_creation["weight"], 0.10, places=10)

    def test_forward_archetype_pillars_use_reviewed_feature_weights(self):
        self.assertEqual(
            PILLAR_SPECS["aerial"]["features"],
            {"Aerial duels per 90": 0.60, "aerial_share": 0.40},
        )
        self.assertEqual(
            PILLAR_SPECS["box"]["features"],
            {"Touches in box per 90": 0.45, "Shots per 90": 0.30, "shot_share": 0.25},
        )
        self.assertEqual(
            PILLAR_SPECS["carry"]["features"],
            {
                "dribble_share": 0.35,
                "Dribbles per 90": 0.30,
                "Offensive duels per 90": 0.20,
                "Crosses per 90": 0.15,
            },
        )
        self.assertEqual(
            PILLAR_SPECS["link"]["features"],
            {"pass_share": 0.25, "Received passes per 90": 0.25, "Passes to penalty area per 90": 0.20, "Key passes per 90": 0.15, "Progressive passes per 90": 0.15},
        )
        self.assertEqual(
            PILLAR_SPECS["creation"]["features"],
            {"Key passes per 90": 0.35, "Shot assists per 90": 0.25, "Passes to penalty area per 90": 0.20, "Through passes per 90": 0.20},
        )
        for pillar in PILLAR_SPECS.values():
            self.assertAlmostEqual(sum(pillar["features"].values()), 1.0, places=9, msg=pillar["name"])

    def test_winger_archetype_uses_eight_reviewed_chinese_pillars(self):
        self.assertEqual(
            [pillar["name"] for pillar in WINGER_PILLAR_SPECS.values()],
            ["边路传中", "持球突破", "禁区威胁", "纵深冲击", "机会创造", "连接参与", "跑动防守", "定位球参与"],
        )
        self.assertEqual(
            WINGER_PILLAR_SPECS["carrying"]["features"],
            {
                "event:dribbles": 0.40,
                "event:progressive_runs": 0.30,
                "event:offensive_duels": 0.20,
                "event:fouls_suffered": 0.10,
            },
        )
        self.assertEqual(
            WINGER_PILLAR_SPECS["link"]["features"],
            {
                "event:passes": 0.10,
                "event:received_passes": 0.10,
                "event:long_passes": 0.18,
                "event:progressive_passes": 0.25,
                "event:final_third_passes": 0.22,
                "direct:forward_pass_share": 0.15,
            },
        )
        for pillar in WINGER_PILLAR_SPECS.values():
            self.assertAlmostEqual(sum(pillar["features"].values()), 1.0, places=9, msg=pillar["name"])
        for weights in (
            TOUCHLINE_EVIDENCE_WEIGHTS,
            INVERTED_EVIDENCE_WEIGHTS,
            INSIDE_FORWARD_EVIDENCE_WEIGHTS,
            PLAYMAKER_EVIDENCE_WEIGHTS,
        ):
            self.assertAlmostEqual(sum(weights.values()), 1.0, places=9)

    def test_winger_role_scores_are_independent_and_role_specific(self):
        touchline = _winger_role_evidence({
            "crossing": 0.95, "carrying": 0.82, "box_threat": 0.25, "depth": 0.78,
            "creation": 0.35, "link": 0.30, "work": 0.55, "set_piece": 0.10,
        })
        inside = _winger_role_evidence({
            "crossing": 0.10, "carrying": 0.70, "box_threat": 0.95, "depth": 0.90,
            "creation": 0.30, "link": 0.25, "work": 0.35, "set_piece": 0.05,
        })
        playmaker = _winger_role_evidence({
            "crossing": 0.35, "carrying": 0.55, "box_threat": 0.35, "depth": 0.45,
            "creation": 0.95, "link": 0.92, "work": 0.45, "set_piece": 0.85,
        })
        self.assertGreater(touchline["traditional_touchline_winger"]["score"], touchline["dribbling_winger"]["score"])
        self.assertGreater(inside["dribbling_winger"]["score"], inside["traditional_touchline_winger"]["score"])
        self.assertGreater(playmaker["winger_wide_playmaker"]["score"], playmaker["inverted_right_winger_left_foot"]["score"])
        self.assertEqual(
            [component["id"] for component in touchline["traditional_touchline_winger"]["components"]],
            ["cross_carry_core", "depth", "work"],
        )
        touchline_with_unrelated_elite_pillars = _winger_role_evidence({
            "crossing": 0.95, "carrying": 0.82, "box_threat": 1.0, "depth": 0.78,
            "creation": 1.0, "link": 1.0, "work": 0.55, "set_piece": 1.0,
        })
        self.assertAlmostEqual(
            touchline["traditional_touchline_winger"]["score"],
            touchline_with_unrelated_elite_pillars["traditional_touchline_winger"]["score"],
            places=9,
        )
        touchline_with_missing_defining_action = _winger_role_evidence({
            "crossing": 0.05, "carrying": 1.0, "box_threat": 1.0, "depth": 1.0,
            "creation": 1.0, "link": 1.0, "work": 1.0, "set_piece": 1.0,
        })
        self.assertLess(
            touchline_with_missing_defining_action["traditional_touchline_winger"]["score"],
            0.55,
        )
        self.assertNotAlmostEqual(
            sum(item["score"] for item in playmaker.values() if item["score"] is not None),
            1.0,
            places=3,
        )

    def test_attacking_midfielder_uses_eight_role_specific_pillars(self):
        self.assertEqual(
            [pillar["name"] for pillar in ATTACKING_MIDFIELDER_PILLAR_SPECS.values()],
            ["接应连接", "机会创造", "传球推进", "持球推进", "禁区攻击", "无球纵深", "边肋活动", "定位球参与"],
        )
        for pillar in ATTACKING_MIDFIELDER_PILLAR_SPECS.values():
            self.assertAlmostEqual(sum(pillar["features"].values()), 1.0, places=9, msg=pillar["name"])
        for weights in (CLASSIC_EVIDENCE_WEIGHTS, SHADOW_EVIDENCE_WEIGHTS, WIDE_TEN_EVIDENCE_WEIGHTS):
            self.assertAlmostEqual(sum(weights.values()), 1.0, places=9)

        classic = _attacking_midfielder_role_evidence({
            "link": 0.92, "creation": 0.95, "passing_progression": 0.85, "carrying": 0.55,
            "box_attack": 0.35, "depth": 0.30, "width": 0.20, "set_piece": 0.75,
        })
        shadow = _attacking_midfielder_role_evidence({
            "link": 0.45, "creation": 0.35, "passing_progression": 0.30, "carrying": 0.72,
            "box_attack": 0.95, "depth": 0.92, "width": 0.15, "set_piece": 0.05,
        })
        wide = _attacking_midfielder_role_evidence({
            "link": 0.65, "creation": 0.90, "passing_progression": 0.80, "carrying": 0.78,
            "box_attack": 0.30, "depth": 0.50, "width": 0.92, "set_piece": 0.30,
        })
        self.assertGreater(classic["attacking_midfielder"]["score"], classic["shadow_striker"]["score"])
        self.assertGreater(shadow["shadow_striker"]["score"], shadow["attacking_midfielder"]["score"])
        self.assertGreater(wide["attacking_mid_wide_playmaker"]["score"], wide["shadow_striker"]["score"])

    def test_attacking_midfielder_experiment_exposes_three_roles_and_eight_pillars(self):
        model = SCOUTING_MODELS["attacking_midfielder"]
        players = []
        for index in range(1, 10):
            raw = {
                "Player": f"AM {index}", "Team": "Test Club", "Position": "AMF, RAMF", "Foot": "right",
                "Minutes played": 900, "Matches played": 10,
            }
            for canonical in ATTACKING_MIDFIELDER_ANALYSIS_COLUMNS:
                raw[canonical] = float(index + 1)
            for dimension in model["dimensions"]:
                for metric in dimension["metrics"]:
                    if metric.get("derived"):
                        for source_column in metric["derived"]["columns"]:
                            raw[source_column] = float(index + 1)
                    else:
                        raw[metric["column"]] = float(index + 1)
            players.append({"id": f"am{index}", "player": raw["Player"], "raw": raw})

        result = evaluate_scouting_role(_doc(players), role_id="attacking_midfielder")
        selected = result["confirmed"][0]
        self.assertTrue(result["settings"]["attackingMidfielderExperimentEnabled"])
        self.assertTrue(result["settings"]["roleSimilarityEnabled"])
        self.assertTrue(result["summary"]["archetypeAvailable"])
        self.assertEqual(len(selected["archetype"]["fits"]), 3)
        self.assertEqual(len(selected["archetype"]["pillars"]), 8)

    def test_attacking_midfielder_requires_explicit_amf_position(self):
        model = SCOUTING_MODELS["attacking_midfielder"]
        players = []
        positions = ["AMF", "RAMF, AMF, LW", "LAMF, LW, CF"]
        for index in range(1, 11):
            position = positions[index - 1] if index <= len(positions) else "AMF, CF"
            raw = {
                "Player": f"AM eligibility {index}", "Team": "Test Club", "Position": position,
                "Foot": "right", "Minutes played": 900, "Matches played": 10,
            }
            for canonical in ATTACKING_MIDFIELDER_ANALYSIS_COLUMNS:
                raw[canonical] = float(index + 1)
            for dimension in model["dimensions"]:
                for metric in dimension["metrics"]:
                    if metric.get("derived"):
                        for source_column in metric["derived"]["columns"]:
                            raw[source_column] = float(index + 1)
                    else:
                        raw[metric["column"]] = float(index + 1)
            players.append({"id": f"am-eligibility-{index}", "player": raw["Player"], "raw": raw})

        result = evaluate_scouting_role(_doc(players), role_id="attacking_midfielder")
        included_ids = {player["id"] for player in [*result["confirmed"], *result["pending"]]}
        self.assertEqual(result["model"]["positionTokens"], ["AMF"])
        self.assertEqual(result["summary"]["comparisonCohortCount"], 9)
        self.assertIn("am-eligibility-2", included_ids)
        self.assertNotIn("am-eligibility-3", included_ids)
        second_position = next(player for player in result["confirmed"] if player["id"] == "am-eligibility-2")
        self.assertEqual(second_position["archetype"]["positionReliability"], 0.75)

    def test_all_attacking_midfielder_roles_use_five_reviewed_dimensions(self):
        expected_dimensions = {
            "attacking_midfielder": {
                "身体对抗": 12, "创造组织": 34, "传控推进": 25,
                "突破推进": 14, "二线得分": 15,
            },
            "shadow_striker": {
                "身体对抗": 15, "禁区终结": 35, "无球到位": 21,
                "持球突破与前场连接": 22, "压迫跑动": 7,
            },
            "attacking_mid_wide_playmaker": {
                "身体对抗": 12, "机会创造": 23, "传控推进": 22,
                "持球突破与肋部活动": 31, "得分威胁": 12,
            },
        }
        for role_id, expected in expected_dimensions.items():
            model = SCOUTING_MODELS[role_id]
            actual = {dimension["name"]: dimension["weight"] for dimension in model["dimensions"]}
            self.assertEqual(actual, expected, role_id)
            physical = next(dimension for dimension in model["dimensions"] if dimension["name"] == "身体对抗")
            self.assertEqual(
                [metric["column"] for metric in physical["metrics"]],
                [
                    "Duels per 90", "Duels won, %", "Aerial duels per 90",
                    "Aerial duels won, %", "Fouls suffered per 90",
                ],
                role_id,
            )

        classic_columns = {
            metric["column"]
            for dimension in SCOUTING_MODELS["attacking_midfielder"]["dimensions"]
            for metric in dimension["metrics"]
        }
        self.assertNotIn("Successful defensive actions per 90", classic_columns)

        shadow = SCOUTING_MODELS["shadow_striker"]
        shadow_columns = {
            metric["column"]
            for dimension in shadow["dimensions"]
            for metric in dimension["metrics"]
        }
        self.assertNotIn("Through passes per 90", shadow_columns)
        self.assertNotIn("Successful attacking actions per 90", shadow_columns)
        self.assertNotIn("Defensive duels per 90", shadow_columns)
        self.assertNotIn("Defensive duels won, %", shadow_columns)

        wide = SCOUTING_MODELS["attacking_mid_wide_playmaker"]
        wide_columns = {
            metric["column"]
            for dimension in wide["dimensions"]
            for metric in dimension["metrics"]
        }
        self.assertNotIn("Deep completions per 90", wide_columns)
        carrying_wide = next(dimension for dimension in wide["dimensions"] if dimension["id"] == "carrying_wide")
        weights = {metric["column"]: metric["weight"] for metric in carrying_wide["metrics"]}
        self.assertEqual(weights["Dribbles per 90"] + weights["Successful dribbles, %"], 7)
        self.assertEqual(weights["Crosses per 90"] + weights["Accurate crosses, %"], 9)

    def test_central_midfielder_uses_eight_role_specific_pillars(self):
        self.assertEqual(
            [pillar["name"] for pillar in CENTRAL_MIDFIELDER_PILLAR_SPECS.values()],
            ["覆盖跑动", "防守参与", "身体参与", "持球推进", "传球推进", "控球连接", "机会创造", "后插上威胁"],
        )
        for pillar in CENTRAL_MIDFIELDER_PILLAR_SPECS.values():
            self.assertAlmostEqual(sum(pillar["features"].values()), 1.0, places=9, msg=pillar["name"])
        link_features = CENTRAL_MIDFIELDER_PILLAR_SPECS["link"]["features"]
        self.assertEqual(link_features["event:progressive_passes"], 0.10)
        self.assertNotIn("event:forward_passes", link_features)
        box_arrival_features = CENTRAL_MIDFIELDER_PILLAR_SPECS["box_arrival"]["features"]
        self.assertEqual(box_arrival_features["direct:xG per 90"], 0.15)
        self.assertNotIn("event:progressive_runs", box_arrival_features)
        for weights in (B2B_EVIDENCE_WEIGHTS, PROGRESSIVE_EVIDENCE_WEIGHTS, CENTRAL_PLAYMAKER_EVIDENCE_WEIGHTS):
            self.assertAlmostEqual(sum(weights.values()), 1.0, places=9)

        b2b = _central_midfielder_role_evidence({
            "coverage": 0.95, "defense": 0.90, "physical": 0.82, "carrying": 0.72,
            "passing_progression": 0.62, "link": 0.55, "creation": 0.35, "box_arrival": 0.88,
        })
        progressive = _central_midfielder_role_evidence({
            "coverage": 0.55, "defense": 0.35, "physical": 0.55, "carrying": 0.95,
            "passing_progression": 0.92, "link": 0.68, "creation": 0.55, "box_arrival": 0.65,
        })
        playmaker = _central_midfielder_role_evidence({
            "coverage": 0.45, "defense": 0.30, "physical": 0.35, "carrying": 0.60,
            "passing_progression": 0.90, "link": 0.96, "creation": 0.92, "box_arrival": 0.30,
        })
        self.assertGreater(b2b["box_to_box_midfielder"]["score"], b2b["central_playmaker"]["score"])
        self.assertGreater(progressive["progressive_number_eight"]["score"], progressive["central_playmaker"]["score"])
        self.assertGreater(playmaker["central_playmaker"]["score"], playmaker["box_to_box_midfielder"]["score"])

    def test_central_midfielder_experiment_and_position_pool(self):
        model = SCOUTING_MODELS["box_to_box_midfielder"]
        players = []
        positions = ["RCMF", "LW, LCMF, AMF", "DMF, AMF"]
        for index in range(1, 11):
            position = positions[index - 1] if index <= len(positions) else "CMF, RCMF"
            raw = {
                "Player": f"CM {index}", "Team": "Test Club", "Position": position,
                "Foot": "right", "Minutes played": 900, "Matches played": 10,
            }
            for canonical in CENTRAL_MIDFIELDER_ANALYSIS_COLUMNS:
                raw[canonical] = float(index + 1)
            for dimension in model["dimensions"]:
                for metric in dimension["metrics"]:
                    if metric.get("derived"):
                        for source_column in metric["derived"]["columns"]:
                            raw[source_column] = float(index + 1)
                    else:
                        raw[metric["column"]] = float(index + 1)
            players.append({"id": f"cm-{index}", "player": raw["Player"], "raw": raw})

        result = evaluate_scouting_role(_doc(players), role_id="box_to_box_midfielder")
        included_ids = {player["id"] for player in [*result["confirmed"], *result["pending"]]}
        self.assertEqual(result["model"]["positionTokens"], ["RCMF", "LCMF", "CMF"])
        self.assertEqual(result["summary"]["comparisonCohortCount"], 9)
        self.assertIn("cm-2", included_ids)
        self.assertNotIn("cm-3", included_ids)
        second_position = next(player for player in result["confirmed"] if player["id"] == "cm-2")
        self.assertEqual(second_position["archetype"]["positionReliability"], 0.75)
        self.assertTrue(result["settings"]["centralMidfielderExperimentEnabled"])
        self.assertTrue(result["settings"]["roleSimilarityEnabled"])
        self.assertTrue(result["summary"]["archetypeAvailable"])
        self.assertEqual(len(result["confirmed"][0]["archetype"]["fits"]), 3)
        self.assertEqual(len(result["confirmed"][0]["archetype"]["pillars"]), 8)

    def test_all_central_midfielder_roles_use_five_reviewed_dimensions(self):
        expected_dimensions = {
            "box_to_box_midfielder": {
                "身体对抗": 18, "全场覆盖": 25, "防守贡献": 22, "推进连接": 22, "进攻参与": 13,
            },
            "progressive_number_eight": {
                "身体对抗": 14, "推进穿线": 35, "机会创造": 22, "中场控制": 17, "二线威胁": 12,
            },
            "central_playmaker": {
                "身体对抗": 12, "控球调度": 38, "机会创造": 24, "推进组织": 18, "无球支持": 8,
            },
        }
        for role_id, expected in expected_dimensions.items():
            model = SCOUTING_MODELS[role_id]
            self.assertEqual(model["positionTokens"], ["RCMF", "LCMF", "CMF"])
            actual = {dimension["name"]: dimension["weight"] for dimension in model["dimensions"]}
            self.assertEqual(actual, expected, role_id)
            self.assertEqual(len(model["dimensions"]), 5)
            physical = next(dimension for dimension in model["dimensions"] if dimension["name"] == "身体对抗")
            self.assertEqual(
                [metric["column"] for metric in physical["metrics"]],
                ["Duels per 90", "Duels won, %", "Aerial duels per 90", "Aerial duels won, %", "Fouls suffered per 90"],
                role_id,
            )
        b2b = SCOUTING_MODELS["box_to_box_midfielder"]
        b2b_metrics = {
            dimension["name"]: {metric["column"]: metric["weight"] for metric in dimension["metrics"]}
            for dimension in b2b["dimensions"]
        }
        self.assertEqual(b2b_metrics["全场覆盖"], {
            "Total Distance per 90": 10,
            "High Intensity Distance per 90": 7,
            "Sprinting Distance per 90 (+25 km/h)": 4,
            "Accelerations per 90": 4,
        })
        self.assertEqual(b2b_metrics["防守贡献"], {
            "Successful defensive actions per 90": 8,
            "PAdj Interceptions": 7,
            "Defensive duels per 90": 7,
        })
        self.assertEqual(b2b_metrics["进攻参与"], {
            "xA per 90": 4,
            "Key passes per 90": 2,
            "Shot assists per 90": 2,
            "Non-penalty goals per 90": 2,
            "Shots per 90": 3,
        })
        progressive = SCOUTING_MODELS["progressive_number_eight"]
        progressive_metrics = {
            dimension["name"]: {metric["column"]: metric["weight"] for metric in dimension["metrics"]}
            for dimension in progressive["dimensions"]
        }
        self.assertEqual(progressive_metrics["推进穿线"], {
            "Progressive runs per 90": 7,
            "Progressive passes per 90": 7,
            "Passes to final third per 90": 5,
            "Passes to penalty area per 90": 4,
            "Dribbles per 90": 4,
            "Successful dribbles, %": 4,
            "Accelerations per 90": 4,
        })
        self.assertEqual(progressive_metrics["机会创造"], {
            "xA per 90": 6,
            "Key passes per 90": 6,
            "Shot assists per 90": 4,
            "Smart passes per 90": 3,
            "Through passes per 90": 3,
        })
        self.assertNotIn("Deep completions per 90", progressive_metrics["机会创造"])
        playmaker = SCOUTING_MODELS["central_playmaker"]
        playmaker_metrics = {
            dimension["name"]: {metric["column"]: metric["weight"] for metric in dimension["metrics"]}
            for dimension in playmaker["dimensions"]
        }
        self.assertEqual(playmaker_metrics["控球调度"], {
            "Passes per 90": 8,
            "Accurate passes, %": 6,
            "Received passes per 90": 6,
            "Forward passes per 90": 5,
            "Progressive passes per 90": 5,
            "Long passes per 90": 4,
            "Accurate long passes, %": 4,
        })
        self.assertEqual(playmaker_metrics["机会创造"], {
            "xA per 90": 5,
            "Key passes per 90": 5,
            "Shot assists per 90": 4,
            "Smart passes per 90": 3,
            "Through passes per 90": 3,
            "Passes to penalty area per 90": 4,
        })
        self.assertEqual(playmaker_metrics["推进组织"], {
            "Progressive passes per 90": 6,
            "Passes to final third per 90": 4,
            "Progressive runs per 90": 3,
            "Dribbles per 90": 3,
            "Successful dribbles, %": 2,
        })
        self.assertIn("HI Distance per 90 (+20 km/h)", METRIC_ALIASES["High Intensity Distance per 90"])
        self.assertIn("Meter/Min", METRIC_ALIASES["Meters per minute"])

    def test_defensive_midfielder_uses_eight_role_specific_pillars(self):
        self.assertEqual(
            [pillar["name"] for pillar in DEFENSIVE_MIDFIELDER_PILLAR_SPECS.values()],
            ["防线保护", "夺回球权", "身体参与", "覆盖跑动", "转换保护", "接应推进", "长传调度", "中卫兼容性"],
        )
        for pillar in DEFENSIVE_MIDFIELDER_PILLAR_SPECS.values():
            self.assertAlmostEqual(sum(pillar["features"].values()), 1.0, places=9, msg=pillar["name"])
        self.assertEqual(DEFENSIVE_MIDFIELDER_PILLAR_SPECS["defensive_shield"]["features"], {
            "direct:PAdj Interceptions": 0.30,
            "event:shots_blocked": 0.10,
            "event:defensive_duels": 0.35,
            "event:aerial_duels": 0.25,
        })
        self.assertEqual(DEFENSIVE_MIDFIELDER_PILLAR_SPECS["transition_protection"]["features"], {
            "direct:Sprinting Distance per 90 (+25 km/h)": 0.50,
            "event:accelerations": 0.50,
        })
        self.assertEqual(DEFENSIVE_MIDFIELDER_PILLAR_SPECS["build_progression"]["features"], {
            "event:passes": 0.15,
            "event:received_passes": 0.15,
            "event:progressive_passes": 0.25,
            "event:forward_passes": 0.10,
            "ratio:forward_pass_share": 0.20,
            "event:final_third_passes": 0.15,
        })
        self.assertEqual(DEFENSIVE_MIDFIELDER_PILLAR_SPECS["long_distribution"]["features"], {
            "event:long_passes": 0.40,
            "ratio:long_pass_share": 0.30,
            "direct:Average pass length, m": 0.20,
            "event:progressive_passes": 0.10,
        })
        self.assertFalse(any(
            feature == "event:back_passes"
            for pillar in DEFENSIVE_MIDFIELDER_PILLAR_SPECS.values()
            for feature in pillar["features"]
        ))
        for weights in (DEEP_PLAYMAKER_EVIDENCE_WEIGHTS, BALL_WINNER_EVIDENCE_WEIGHTS, HALF_BACK_EVIDENCE_WEIGHTS):
            self.assertAlmostEqual(sum(weights.values()), 1.0, places=9)

        playmaker = _defensive_midfielder_role_evidence({
            "defensive_shield": 0.55, "ball_winning": 0.35, "physical": 0.45, "coverage": 0.50,
            "transition_protection": 0.45, "build_progression": 0.95, "long_distribution": 0.96,
            "centre_back_compatibility": 0.20,
        })
        ball_winner = _defensive_midfielder_role_evidence({
            "defensive_shield": 0.92, "ball_winning": 0.95, "physical": 0.88, "coverage": 0.90,
            "transition_protection": 0.90, "build_progression": 0.40, "long_distribution": 0.30,
            "centre_back_compatibility": 0.20,
        })
        half_back = _defensive_midfielder_role_evidence({
            "defensive_shield": 0.90, "ball_winning": 0.50, "physical": 0.80, "coverage": 0.50,
            "transition_protection": 0.55, "build_progression": 0.82, "long_distribution": 0.35,
            "centre_back_compatibility": 1.00,
        })
        self.assertGreater(playmaker["deep_lying_playmaker"]["score"], playmaker["ball_winning_midfielder"]["score"])
        self.assertGreater(ball_winner["ball_winning_midfielder"]["score"], ball_winner["deep_lying_playmaker"]["score"])
        self.assertGreater(half_back["half_back"]["score"], half_back["deep_lying_playmaker"]["score"])
        self.assertEqual(_centre_back_compatibility({"positionValue": "DMF, RCB"}), 1.0)
        self.assertEqual(_centre_back_compatibility({"positionValue": "LDMF, RCMF"}), 0.20)

    def test_defensive_midfielder_experiment_requires_explicit_dmf_position(self):
        model = SCOUTING_MODELS["deep_lying_playmaker"]
        players = []
        positions = ["DMF", "CB, DMF", "CB", "RCMF"]
        for index in range(1, 13):
            position = positions[index - 1] if index <= len(positions) else "LDMF, DMF"
            raw = {
                "Player": f"DM {index}", "Team": "Test Club", "Position": position,
                "Foot": "right", "Minutes played": 900, "Matches played": 10,
            }
            for canonical in DEFENSIVE_MIDFIELDER_ANALYSIS_COLUMNS:
                raw[canonical] = float(index + 1)
            for dimension in model["dimensions"]:
                for metric in dimension["metrics"]:
                    if metric.get("derived"):
                        for source_column in metric["derived"]["columns"]:
                            raw[source_column] = float(index + 1)
                    else:
                        raw[metric["column"]] = float(index + 1)
            players.append({"id": f"dm-{index}", "player": raw["Player"], "raw": raw})

        result = evaluate_scouting_role(_doc(players), role_id="deep_lying_playmaker")
        ranked_players = [*result["confirmed"], *result["pending"]]
        included_ids = {player["id"] for player in ranked_players}
        self.assertEqual(result["model"]["positionTokens"], ["DMF", "RDMF", "LDMF"])
        self.assertEqual(result["summary"]["comparisonCohortCount"], 10)
        self.assertIn("dm-2", included_ids)
        self.assertNotIn("dm-3", included_ids)
        self.assertNotIn("dm-4", included_ids)
        second_position = next(player for player in result["confirmed"] if player["id"] == "dm-2")
        self.assertEqual(second_position["archetype"]["positionReliability"], 0.75)
        dual_position = next(player for player in ranked_players if player["id"] == "dm-2")
        pure_defensive_midfielder = next(player for player in ranked_players if player["id"] == "dm-1")
        dual_pillar = next(pillar for pillar in dual_position["archetype"]["pillars"] if pillar["name"] == "中卫兼容性")
        pure_pillar = next(pillar for pillar in pure_defensive_midfielder["archetype"]["pillars"] if pillar["name"] == "中卫兼容性")
        self.assertEqual(dual_pillar["score"], 100.0)
        self.assertEqual(pure_pillar["score"], 20.0)
        self.assertTrue(result["settings"]["defensiveMidfielderExperimentEnabled"])
        self.assertTrue(result["settings"]["roleSimilarityEnabled"])
        self.assertTrue(result["summary"]["archetypeAvailable"])
        self.assertEqual(len(result["confirmed"][0]["archetype"]["fits"]), 3)
        self.assertEqual(len(result["confirmed"][0]["archetype"]["pillars"]), 8)

    def test_all_defensive_midfielder_roles_use_five_reviewed_dimensions(self):
        expected_dimensions = {
            "deep_lying_playmaker": {
                "身体对抗": 20, "后场调度": 32, "纵向输送": 26, "防守保护": 16, "无球覆盖": 6,
            },
            "ball_winning_midfielder": {
                "身体对抗": 27, "夺回球权": 38, "覆盖跑动": 15, "防守纪律": 10, "后场调度": 10,
            },
            "half_back": {
                "身体对抗": 23, "回撤出球": 27, "防守": 30, "转换保护": 12, "控球克制": 8,
            },
        }
        for role_id, expected in expected_dimensions.items():
            model = SCOUTING_MODELS[role_id]
            self.assertEqual(model["positionTokens"], ["DMF", "RDMF", "LDMF"])
            self.assertEqual({dimension["name"]: dimension["weight"] for dimension in model["dimensions"]}, expected)
            self.assertEqual(len(model["dimensions"]), 5)
            physical = next(dimension for dimension in model["dimensions"] if dimension["name"] == "身体对抗")
            self.assertEqual(
                [metric["column"] for metric in physical["metrics"]],
                ["Duels per 90", "Duels won, %", "Aerial duels per 90", "Aerial duels won, %", "Fouls suffered per 90"],
                role_id,
            )

        playmaker_dimensions = {dimension["name"]: dimension for dimension in SCOUTING_MODELS["deep_lying_playmaker"]["dimensions"]}
        self.assertNotIn("Back passes per 90", [metric["column"] for metric in playmaker_dimensions["后场调度"]["metrics"]])

        ball_winner_dimensions = {dimension["name"]: dimension for dimension in SCOUTING_MODELS["ball_winning_midfielder"]["dimensions"]}
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in ball_winner_dimensions["后场调度"]["metrics"]],
            [
                ("Forward passes per 90", 4),
                ("Accurate passes, %", 2),
                ("Accurate long passes, %", 2),
                ("Progressive passes per 90", 2),
            ],
        )
        self.assertTrue(all(metric["direction"] == "lower" for metric in ball_winner_dimensions["防守纪律"]["metrics"]))
        self.assertEqual(default_percentile_algorithm("Fouls per 90"), STANDARD_NEGATIVE)
        self.assertEqual(default_percentile_algorithm("Yellow cards per 90"), EVENT_NEGATIVE)
        self.assertEqual(default_percentile_algorithm("Red cards per 90"), EVENT_NEGATIVE)

        half_back_dimensions = {dimension["name"]: dimension for dimension in SCOUTING_MODELS["half_back"]["dimensions"]}
        self.assertNotIn("Back passes per 90", [metric["column"] for metric in half_back_dimensions["回撤出球"]["metrics"]])
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in half_back_dimensions["转换保护"]["metrics"]],
            [
                ("Total Distance per 90", 5),
                ("High Intensity Distance per 90", 4),
                ("Max Speed (km/h)", 3),
            ],
        )

    def test_half_back_losses_uses_auditable_pass_loss_fallback(self):
        security = next(dimension for dimension in SCOUTING_MODELS["half_back"]["dimensions"] if dimension["name"] == "控球克制")
        losses = next(metric for metric in security["metrics"] if metric["column"] == "Losses per 90")
        lookup = _column_lookup(["Passes per 90", "Accurate passes, %"])
        resolved = _resolve_metric(lookup, losses)
        self.assertTrue(resolved["usedFallback"])
        self.assertEqual(resolved["sourceColumns"], ["Passes per 90", "Accurate passes, %"])
        self.assertAlmostEqual(
            _metric_value({"Passes per 90": 50, "Accurate passes, %": 80}, resolved),
            10.0,
        )
        self.assertEqual(default_percentile_algorithm("Losses per 90"), STANDARD_NEGATIVE)
        direct = _resolve_metric(_column_lookup(["Losses per 90", "Passes per 90", "Accurate passes, %"]), losses)
        self.assertEqual(direct["column"], "Losses per 90")
        self.assertIsNone(direct["derived"])

    def test_complete_role_catalog_is_present_and_balanced(self):
        self.assertEqual(len([model for model in SCOUTING_MODELS.values() if model.get("catalogVisible", True)]), 26)
        self.assertEqual(
            {model["family"] for model in SCOUTING_MODELS.values() if model.get("catalogVisible", True)},
            {"中锋", "边锋", "前腰", "中前卫", "后腰", "边后卫", "中卫", "门将"},
        )
        for model in SCOUTING_MODELS.values():
            self.assertEqual(sum(dimension["weight"] for dimension in model["dimensions"]), 100, model["id"])
            self.assertEqual(
                sum(metric["weight"] for dimension in model["dimensions"] for metric in dimension["metrics"]),
                100,
                model["id"],
            )

    def test_target_forward_uses_reviewed_weights(self):
        model = SCOUTING_MODELS["target_forward"]
        dimensions = {dimension["name"]: dimension for dimension in model["dimensions"]}
        self.assertEqual(
            {name: dimension["weight"] for name, dimension in dimensions.items()},
            {"制空与对抗": 40, "禁区终结": 30, "支点连接": 20, "体能与防守": 10},
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["制空与对抗"]["metrics"]],
            [
                ("Duels per 90", 7),
                ("Duels won, %", 9),
                ("Aerial duels per 90", 10),
                ("Aerial duels won, %", 9),
                ("Fouls suffered per 90", 5),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["禁区终结"]["metrics"]],
            [
                ("Non-penalty goals per 90", 7),
                ("Goal - xG per 90", 5),
                ("Head goals per 90", 10),
                ("Shots per 90", 3),
                ("Goal conversion, %", 5),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["支点连接"]["metrics"]],
            [
                ("Shot assists per 90", 4),
                ("xA per 90", 5),
                ("Dribbles per 90", 6),
                ("Successful dribbles, %", 5),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["体能与防守"]["metrics"]],
            [
                ("Successful defensive actions per 90", 4),
                ("Total Distance per 90", 4),
                ("Max Speed (km/h)", 2),
            ],
        )

    def test_poacher_uses_reviewed_weights(self):
        model = SCOUTING_MODELS["poacher"]
        dimensions = {dimension["name"]: dimension for dimension in model["dimensions"]}
        self.assertEqual(model["version"], "poacher-v3-capability")
        self.assertEqual(
            {name: dimension["weight"] for name, dimension in dimensions.items()},
            {"终结效率": 50, "无球到位与禁区占位": 25, "禁区对抗": 18, "连接与压迫": 7},
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["终结效率"]["metrics"]],
            [
                ("Non-penalty goals per 90", 13),
                ("Goal - xG per 90", 10),
                ("Shots per 90", 10),
                ("Shots on target, %", 8),
                ("Goal conversion, %", 9),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["无球到位与禁区占位"]["metrics"]],
            [
                ("Touches in box per 90", 8),
                ("Accelerations per 90", 5),
                ("Sprinting Distance per 90 (+25 km/h)", 6),
                ("Max Speed (km/h)", 3),
                ("Progressive runs per 90", 3),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["禁区对抗"]["metrics"]],
            [
                ("Head goals per 90", 8),
                ("Aerial duels per 90", 4),
                ("Aerial duels won, %", 4),
                ("Offensive duels won, %", 2),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["连接与压迫"]["metrics"]],
            [
                ("Shot assists per 90", 2),
                ("Successful defensive actions per 90", 3),
                ("Total Distance per 90", 2),
            ],
        )

    def test_power_forward_uses_reviewed_weights(self):
        model = SCOUTING_MODELS["power_forward"]
        dimensions = {dimension["name"]: dimension for dimension in model["dimensions"]}
        self.assertEqual(model["version"], "power-forward-v3-capability")
        self.assertEqual(
            {name: dimension["weight"] for name, dimension in dimensions.items()},
            {"力量对抗": 30, "速度爆发": 25, "冲击终结": 35, "跑动连接": 10},
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["力量对抗"]["metrics"]],
            [
                ("Duels per 90", 5),
                ("Duels won, %", 6),
                ("Aerial duels per 90", 5),
                ("Aerial duels won, %", 6),
                ("Offensive duels won, %", 8),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["速度爆发"]["metrics"]],
            [
                ("Sprinting Distance per 90 (+25 km/h)", 8),
                ("Max Speed (km/h)", 7),
                ("Accelerations per 90", 5),
                ("Progressive runs per 90", 5),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["冲击终结"]["metrics"]],
            [
                ("Non-penalty goals per 90", 9),
                ("Goal - xG per 90", 6),
                ("Shots per 90", 6),
                ("Touches in box per 90", 6),
                ("Shots on target, %", 4),
                ("Goal conversion, %", 4),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["跑动连接"]["metrics"]],
            [
                ("Successful defensive actions per 90", 2),
                ("Total Distance per 90", 3),
                ("Fouls suffered per 90", 3),
                ("Shot assists per 90", 2),
            ],
        )

    def test_playmaking_forward_uses_reviewed_weights(self):
        model = SCOUTING_MODELS["playmaking_forward"]
        dimensions = {dimension["name"]: dimension for dimension in model["dimensions"]}
        self.assertEqual(model["version"], "playmaking-forward-v4-capability")
        self.assertEqual(
            {name: dimension["weight"] for name, dimension in dimensions.items()},
            {"机会创造": 30, "回撤组织与推进": 27, "身体对抗": 20, "前场防守": 8, "禁区终结": 15},
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["机会创造"]["metrics"]],
            [
                ("xA per 90", 9),
                ("Key passes per 90", 8),
                ("Shot assists per 90", 3),
                ("Smart passes per 90", 2),
                ("Through passes per 90", 2),
                ("Passes to penalty area per 90", 6),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["回撤组织与推进"]["metrics"]],
            [
                ("Progressive passes per 90", 4),
                ("Progressive runs per 90", 4),
                ("Dribbles per 90", 6),
                ("Successful dribbles, %", 4),
                ("Successful attacking actions per 90", 3),
                ("Forward passes share, %", 4),
                ("Fouls suffered per 90", 2),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["身体对抗"]["metrics"]],
            [
                ("Duels per 90", 4),
                ("Duels won, %", 5),
                ("Aerial duels per 90", 4),
                ("Aerial duels won, %", 5),
                ("Offensive duels won, %", 2),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["前场防守"]["metrics"]],
            [
                ("Successful defensive actions per 90", 5),
                ("Total Distance per 90", 3),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["禁区终结"]["metrics"]],
            [
                ("Non-penalty goals per 90", 5),
                ("Goal - xG per 90", 4),
                ("Shots per 90", 3),
                ("Touches in box per 90", 3),
            ],
        )

    def test_playmaking_forward_derives_forward_pass_share(self):
        model = SCOUTING_MODELS["playmaking_forward"]
        players = []
        for index in range(1, 13):
            raw = {
                "Player": f"Playmaker {index}", "Team": "Test Club", "Position": "CF",
                "Foot": "right", "Minutes played": 900, "Matches played": 10,
            }
            for dimension in model["dimensions"]:
                for metric in dimension["metrics"]:
                    derived = metric.get("derived")
                    if derived:
                        for source in derived["columns"]:
                            raw[source] = float(index + 10)
                    else:
                        raw[metric["column"]] = float(index)
            players.append({"id": f"pm{index}", "player": raw["Player"], "raw": raw})
        players[0]["raw"]["Forward passes per 90"] = 45.0
        players[0]["raw"]["Passes per 90"] = 60.0
        result = evaluate_scouting_role(_doc(players), role_id="playmaking_forward")
        selected = next(player for player in result["confirmed"] if player["id"] == "pm1")
        metric = next(item for item in selected["metrics"] if item["column"] == "Forward passes share, %")
        self.assertAlmostEqual(metric["rawValue"], 75.0, places=6)
        self.assertEqual(metric["sourceColumns"], ["Forward passes per 90", "Passes per 90"])

    def test_complete_forward_uses_reviewed_weights(self):
        model = SCOUTING_MODELS["complete_forward"]
        dimensions = {dimension["name"]: dimension for dimension in model["dimensions"]}
        self.assertEqual(model["version"], "complete-forward-v3-capability")
        self.assertEqual(
            {name: dimension["weight"] for name, dimension in dimensions.items()},
            {"得分威胁": 30, "连接创造": 27, "身体对抗": 20, "推进冲击": 15, "防守跑动": 8},
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["连接创造"]["metrics"]],
            [
                ("xA per 90", 5),
                ("Key passes per 90", 4),
                ("Shot assists per 90", 4),
                ("Forward passes share, %", 4),
                ("Progressive passes per 90", 5),
                ("Passes to penalty area per 90", 5),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["防守跑动"]["metrics"]],
            [
                ("Successful defensive actions per 90", 5),
                ("Total Distance per 90", 3),
            ],
        )

    def test_model_weights_sum_to_100(self):
        dimension_weight = sum(dimension["weight"] for dimension in INVERTED_RIGHT_WINGER_MODEL["dimensions"])
        metric_weight = sum(metric["weight"] for dimension in INVERTED_RIGHT_WINGER_MODEL["dimensions"] for metric in dimension["metrics"])
        self.assertEqual(dimension_weight, 100)
        self.assertEqual(metric_weight, 100)

    def test_requested_modules_and_fouls_placement(self):
        dimensions = {dimension["id"]: dimension for dimension in INVERTED_RIGHT_WINGER_MODEL["dimensions"]}
        self.assertIn("physical_duels", dimensions)
        self.assertIn("progression_delivery", dimensions)
        self.assertIn("chance_creation", dimensions)
        self.assertNotIn("fitness_defensive_work", dimensions)
        self.assertNotIn("fitness", dimensions)
        self.assertNotIn("defensive_work", dimensions)
        self.assertNotIn("combination_resistance", dimensions)
        self.assertEqual(dimensions["physical_duels"]["weight"], 15)
        self.assertEqual(dimensions["goal_threat"]["weight"], 30)
        self.assertEqual(dimensions["one_v_one_progression"]["weight"], 25)
        self.assertEqual(dimensions["progression_delivery"]["weight"], 12)
        self.assertEqual(dimensions["chance_creation"]["weight"], 18)
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["goal_threat"]["metrics"]],
            [
                ("Non-penalty goals per 90", 8),
                ("Goal - xG per 90", 6),
                ("Shots per 90", 5),
                ("Shots on target, %", 6),
                ("Goal conversion, %", 5),
            ],
        )
        self.assertEqual(
            [(metric["column"], metric["weight"]) for metric in dimensions["chance_creation"]["metrics"]],
            [
                ("xA per 90", 5),
                ("Key passes per 90", 4),
                ("Shot assists per 90", 3),
                ("Passes to penalty area per 90", 3),
                ("Progressive passes per 90", 2),
                ("Corners per 90", 0.5),
                ("Free kicks per 90", 0.5),
            ],
        )
        physical = dimensions["physical_duels"]
        fouls = next(metric for metric in physical["metrics"] if metric["column"] == "Fouls suffered per 90")
        self.assertEqual(fouls["weight"], 4)

    def test_goal_minus_xg_is_derived_from_source_columns(self):
        players = [_player(index) for index in range(1, 13)]
        players[0]["raw"]["Goals per 90"] = 0.61
        players[0]["raw"]["xG per 90"] = 0.39
        result = evaluate_inverted_right_winger(_doc(players))
        selected = next(player for player in result["confirmed"] if player["id"] == "p1")
        metric = next(item for item in selected["metrics"] if item["column"] == "Goal - xG per 90")
        self.assertAlmostEqual(metric["rawValue"], 0.22, places=6)
        definition = next(
            item
            for dimension in INVERTED_RIGHT_WINGER_MODEL["dimensions"]
            for item in dimension["metrics"]
            if item["column"] == "Goal - xG per 90"
        )
        self.assertEqual(definition["derived"]["columns"], ["Goals per 90", "xG per 90"])

    def test_non_foot_filtered_role_puts_all_eligible_players_in_main_list(self):
        model = SCOUTING_MODELS["target_forward"]
        players = []
        for index in range(1, 13):
            raw = {
                "Player": f"CF {index}", "Team": "Test Club", "Position": "CF", "Foot": "unknown",
                "Minutes played": 900, "Matches played": 10,
            }
            for dimension in model["dimensions"]:
                for metric in dimension["metrics"]:
                    derived = metric.get("derived")
                    if derived:
                        for source in derived["columns"]:
                            raw[source] = float(index)
                    else:
                        raw[metric["column"]] = float(index)
            players.append({"id": f"cf{index}", "player": raw["Player"], "raw": raw})
        result = evaluate_scouting_role(_doc(players), role_id="target_forward")
        self.assertTrue(result["ok"])
        self.assertEqual(result["summary"]["confirmedCount"], 12)
        self.assertEqual(result["summary"]["pendingCount"], 0)

    def test_forward_experiment_couples_volume_and_rate_and_exposes_archetypes(self):
        model = SCOUTING_MODELS["target_forward"]
        players = []
        for index in range(1, 13):
            raw = {
                "Player": f"CF {index}", "Team": "Test Club", "Position": "CF", "Foot": "right",
                "Minutes played": 900, "Matches played": 10,
                "Passes per 90": 12 + index,
                "Received passes per 90": 10 + index,
                "Received long passes per 90": 1 + index * 0.1,
                "Progressive passes per 90": 2 + index * 0.1,
                "Touches in box per 90": 2 + index * 0.2,
                "Accelerations per 90": 1 + index * 0.1,
                "Successful attacking actions per 90": 2 + index * 0.1,
            }
            for dimension in model["dimensions"]:
                for metric in dimension["metrics"]:
                    derived = metric.get("derived")
                    if derived:
                        for source in derived["columns"]:
                            raw[source] = float(index) / 10
                    elif metric["column"].endswith(", %"):
                        raw[metric["column"]] = 55.0
                    else:
                        raw[metric["column"]] = float(index)
            players.append({"id": f"cf{index}", "player": raw["Player"], "raw": raw})

        players[0]["raw"]["Duels per 90"] = 1.0
        players[0]["raw"]["Duels won, %"] = 95.0
        players[-1]["raw"]["Duels per 90"] = 12.0
        players[-1]["raw"]["Duels won, %"] = 60.0
        result = evaluate_scouting_role(_doc(players), role_id="target_forward")
        low_volume = next(player for player in result["confirmed"] if player["id"] == "cf1")
        high_volume = next(player for player in result["confirmed"] if player["id"] == "cf12")
        low_duel_rows = [metric for metric in low_volume["metrics"] if metric.get("coupledGroupId") == "duel_effectiveness"]
        high_duel_rows = [metric for metric in high_volume["metrics"] if metric.get("coupledGroupId") == "duel_effectiveness"]

        self.assertEqual(len(low_duel_rows), 2)
        self.assertEqual(low_duel_rows[0]["percentile"], low_duel_rows[1]["percentile"])
        self.assertLess(low_duel_rows[0]["percentile"], high_duel_rows[0]["percentile"])
        self.assertEqual(len(low_volume["archetype"]["fits"]), 5)
        self.assertIn(low_volume["archetype"]["denominatorMode"], {"源表总行动数/90", "代理行动结构"})
        self.assertNotAlmostEqual(sum(item["probability"] for item in low_volume["archetype"]["fits"]), 1.0, places=3)
        self.assertNotIn("混合型", low_volume["archetype"]["label"])
        self.assertIn(low_volume["archetype"]["status"], {"clear", "leaning", "uncertain"})
        self.assertGreaterEqual(low_volume["archetype"]["probabilityGap"], 0.0)
        self.assertGreaterEqual(low_volume["archetype"]["relativeSeparation"], 0.0)
        self.assertIn("eligible", low_volume["archetype"]["completeForwardGate"])
        self.assertIsNotNone(low_volume["roleFitProbability"])
        self.assertTrue(result["settings"]["forwardExperimentEnabled"])
        complete_fit = next(item for item in low_volume["archetype"]["fits"] if item["roleId"] == "complete_forward")
        self.assertTrue(low_volume["archetype"]["completeForwardGate"]["dataEligible"])
        self.assertGreater(complete_fit["score"], 0.0)
        self.assertEqual(complete_fit["probability"], 0.0)
        self.assertEqual(result["settings"]["archetypeProbabilityMode"], "independent_similarity_not_normalized_v8")
        self.assertEqual(result["settings"]["archetypeLabelMode"], "sparse_exclusive_labels_v8")
        self.assertGreaterEqual(result["summary"]["coupledGroupCount"], 4)

    def test_winger_experiment_exposes_four_roles_and_eight_pillars(self):
        players = [_player(index, foot="left") for index in range(1, 13)]
        analysis_columns = {
            "Duels per 90": 7.0,
            "Crosses per 90": 3.0,
            "Crosses to goalie box per 90": 0.8,
            "Dribbles per 90": 4.0,
            "Offensive duels per 90": 7.0,
            "Progressive runs per 90": 3.0,
            "Fouls suffered per 90": 1.5,
            "Shots per 90": 2.0,
            "Touches in box per 90": 4.0,
            "Accelerations per 90": 1.2,
            "Key passes per 90": 1.0,
            "Shot assists per 90": 0.8,
            "Passes to penalty area per 90": 2.0,
            "Smart passes per 90": 0.3,
            "Through passes per 90": 0.4,
            "Passes per 90": 28.0,
            "Received passes per 90": 22.0,
            "Long passes per 90": 2.5,
            "Progressive passes per 90": 3.5,
            "Passes to final third per 90": 5.0,
            "Forward passes per 90": 9.0,
            "Defensive duels per 90": 3.0,
            "Successful defensive actions per 90": 4.0,
            "Sprinting Distance per 90 (+25 km/h)": 190.0,
            "Max Speed (km/h)": 34.0,
            "Total Distance per 90": 9300.0,
            "Corners per 90": 0.4,
            "Free kicks per 90": 0.2,
            "Crosses from left flank per 90": 0.2,
            "Crosses from right flank per 90": 2.8,
            "Total actions per 90": 55.0,
        }
        for index, player in enumerate(players, start=1):
            for column, base in analysis_columns.items():
                player["raw"][column] = base + index * 0.01

        result = evaluate_scouting_role(_doc(players), role_id="inverted_right_winger_left_foot")
        self.assertTrue(result["ok"])
        self.assertTrue(result["settings"]["wingerExperimentEnabled"])
        self.assertTrue(result["settings"]["roleSimilarityEnabled"])
        self.assertTrue(result["summary"]["archetypeAvailable"])
        selected = result["confirmed"][0]
        self.assertEqual(len(selected["archetype"]["fits"]), 4)
        self.assertEqual(len(selected["archetype"]["pillars"]), 8)
        self.assertIn(selected["archetype"]["activitySide"], {"主要右侧活动", "主要左侧活动", "左右活动侧暂不明确"})
        self.assertIsNotNone(selected["roleFitScore"])

    def test_forward_role_evidence_separates_style_from_ability(self):
        balanced_low_ability = {
            "hold_up": 0.25,
            "aerial": 0.25,
            "box": 0.25,
            "depth": 0.25,
            "carry": 0.25,
            "link": 0.25,
            "creation": 0.25,
            "work": 0.25,
        }
        profile = _complete_forward_profile(balanced_low_ability)
        evidence = _forward_role_evidence(balanced_low_ability)

        self.assertTrue(profile["dataEligible"])
        self.assertFalse(profile["roleEligible"])
        self.assertEqual(profile["availableAxisCount"], 5)
        self.assertEqual(profile["breadthFloor"], 0.25)
        self.assertAlmostEqual(profile["activityCoverage"], 0.40, places=6)
        self.assertEqual(profile["directnessPenalty"], 0.0)
        self.assertGreater(evidence["complete_forward"]["score"], balanced_low_ability["box"])

        box_led = {
            "hold_up": 0.30,
            "aerial": 0.40,
            "box": 0.90,
            "depth": 0.35,
            "carry": 0.25,
            "link": 0.35,
            "creation": 0.35,
            "work": 0.40,
        }
        box_evidence = _forward_role_evidence(box_led)
        self.assertTrue(box_evidence["poacher"]["eligible"])
        self.assertGreater(box_evidence["poacher"]["score"], box_evidence["power_forward"]["score"])
        self.assertIn("playmaking_forward", box_evidence)

        direct_runner = {
            "hold_up": 0.73,
            "aerial": 0.76,
            "box": 0.62,
            "depth": 0.68,
            "carry": 0.60,
            "link": 0.31,
            "creation": 0.50,
            "work": 0.30,
        }
        direct_profile = _complete_forward_profile(direct_runner)
        direct_evidence = _forward_role_evidence(direct_runner)
        self.assertGreater(direct_profile["directnessPenalty"], 0.15)
        self.assertFalse(direct_profile["roleEligible"])
        self.assertFalse(direct_evidence["poacher"]["eligible"])
        self.assertLess(direct_evidence["complete_forward"]["score"], direct_evidence["target_forward"]["score"])

        impact_runner = {
            "hold_up": 0.65,
            "aerial": 0.85,
            "box": 0.97,
            "depth": 0.88,
            "carry": 0.91,
            "link": 0.39,
            "creation": 0.45,
            "work": 0.50,
        }
        impact_evidence = _forward_role_evidence(impact_runner)
        self.assertFalse(impact_evidence["poacher"]["eligible"])
        self.assertGreater(impact_evidence["power_forward"]["score"], impact_evidence["target_forward"]["score"])

        broad_forward = {
            "hold_up": 0.56,
            "aerial": 0.34,
            "box": 0.67,
            "depth": 0.67,
            "carry": 0.98,
            "link": 0.82,
            "creation": 0.87,
            "work": 0.60,
        }
        broad_evidence = _forward_role_evidence(broad_forward)
        self.assertTrue(_complete_forward_profile(broad_forward)["roleEligible"])
        self.assertGreater(broad_evidence["complete_forward"]["score"], 0.85)
        self.assertEqual(_forward_position_context("CF, RW")["reliability"], 1.0)
        self.assertEqual(_forward_position_context("LW, CF, LWF")["reliability"], 0.75)
        self.assertEqual(_forward_position_context("AMF, LAMF, CF")["reliability"], 0.55)

    def test_forward_elite_lift_is_attributed_to_metrics_and_preserves_closed_loop(self):
        model = SCOUTING_MODELS["target_forward"]
        players = []
        for index in range(1, 13):
            raw = {
                "Player": f"CF {index}", "Team": "Test Club", "Position": "CF", "Foot": "right",
                "Minutes played": 900, "Matches played": 10,
            }
            for dimension in model["dimensions"]:
                for metric in dimension["metrics"]:
                    derived = metric.get("derived")
                    if derived:
                        raw[derived["columns"][0]] = float(index) * 0.2
                        raw[derived["columns"][1]] = float(index) * 0.1
                    elif metric["column"].endswith(", %"):
                        raw[metric["column"]] = 40.0 + index * 2
                    else:
                        raw[metric["column"]] = float(index)
            players.append({"id": f"elite{index}", "player": raw["Player"], "raw": raw})

        result = evaluate_scouting_role(_doc(players), role_id="target_forward")
        selected = next(player for player in result["confirmed"] if player["id"] == "elite12")

        elite_metrics = [metric for metric in selected["metrics"] if metric["eliteMetricBonus"] > 0]
        self.assertGreater(len(elite_metrics), 0)
        self.assertTrue(all(metric["scoringPercentile"] > metric["percentile"] for metric in elite_metrics))
        self.assertGreater(selected["rawScoreExact"], selected["baseScoreExact"])
        self.assertAlmostEqual(
            sum(metric["contribution"] for metric in selected["metrics"]),
            selected["scoreExact"] - 50.0,
            places=10,
        )

    def test_winger_uses_coupling_and_metric_elite_lift(self):
        players = [_player(index, foot="left") for index in range(1, 13)]
        result = evaluate_inverted_right_winger(_doc(players))
        selected = next(player for player in result["confirmed"] if player["id"] == "p12")

        self.assertEqual(result["settings"]["coupledMetricMode"], "bayesian_volume_efficiency_v1")
        self.assertEqual(result["summary"]["coupledGroupCount"], 6)
        self.assertEqual(
            {metric["coupledGroupId"] for metric in selected["metrics"] if metric.get("coupledGroupId")},
            {"duel_effectiveness", "aerial_effectiveness", "finishing_effectiveness", "dribble_effectiveness", "offensive_duel_effectiveness", "crossing_effectiveness"},
        )
        elite_metrics = [metric for metric in selected["metrics"] if metric["eliteMetricBonus"] > 0]
        self.assertGreater(len(elite_metrics), 0)
        self.assertTrue(all(metric["scoringPercentile"] > metric["percentile"] for metric in elite_metrics))
        self.assertAlmostEqual(
            sum(metric["contribution"] for metric in selected["metrics"]),
            selected["scoreExact"] - 50.0,
            places=10,
        )

    def test_foot_buckets_and_sample_filters_are_separate_from_comparison_cohort(self):
        players = [_player(index) for index in range(1, 13)]
        players[0] = _player(1, foot="right")
        players[1] = _player(2, foot="unknown")
        players[2] = _player(3, foot="both")
        players[3] = _player(4, minutes=299, matches=10)
        players[4] = _player(5, minutes=300, matches=30)

        result = evaluate_inverted_right_winger(_doc(players))

        self.assertTrue(result["ok"])
        self.assertEqual(result["summary"]["comparisonCohortCount"], 10)
        self.assertEqual(result["summary"]["sampleExcludedCount"], 2)
        self.assertEqual(result["summary"]["rightFootExcludedCount"], 1)
        self.assertEqual(result["summary"]["pendingCount"], 2)
        self.assertEqual(result["summary"]["confirmedCount"], 7)

    def test_minutes_reliability_shrinks_score_toward_50(self):
        players = [_player(index) for index in range(1, 13)]
        players[-1] = _player(12, minutes=300, matches=10)
        result = evaluate_inverted_right_winger(_doc(players))
        selected = next(player for player in result["confirmed"] if player["id"] == "p12")

        self.assertEqual(selected["reliability"], 0.6)
        expected = 50 + 0.6 * (selected["rawScoreExact"] - 50)
        self.assertAlmostEqual(selected["scoreExact"], expected, places=10)

    def test_metric_contributions_close_exactly_to_final_score(self):
        players = [_player(index) for index in range(1, 13)]
        result = evaluate_inverted_right_winger(_doc(players))
        selected = next(player for player in result["confirmed"] if player["id"] == "p12")

        self.assertAlmostEqual(
            sum(metric["contribution"] for metric in selected["metrics"]),
            selected["scoreExact"] - 50.0,
            places=10,
        )
        self.assertAlmostEqual(
            sum(metric["rawContribution"] for metric in selected["metrics"]),
            selected["rawScoreExact"] - 50.0,
            places=10,
        )

    def test_early_season_keeps_low_minute_players(self):
        players = [_player(index) for index in range(1, 13)]
        players[0] = _player(1, minutes=60, matches=8)
        result = evaluate_inverted_right_winger(_doc(players), early_season=True)

        self.assertEqual(result["summary"]["sampleExcludedCount"], 0)
        selected = next(player for player in result["confirmed"] if player["id"] == "p1")
        self.assertAlmostEqual(selected["reliability"], 60 / 500, places=3)

    def test_missing_foot_column_routes_players_to_pending(self):
        players = [_player(index) for index in range(1, 13)]
        for player in players:
            player["raw"].pop("Foot")
        result = evaluate_inverted_right_winger(_doc(players))

        self.assertTrue(result["ok"])
        self.assertEqual(result["summary"]["confirmedCount"], 0)
        self.assertEqual(result["summary"]["pendingCount"], 12)
        self.assertTrue(result["summary"]["scoreAvailable"])


if __name__ == "__main__":
    unittest.main()
