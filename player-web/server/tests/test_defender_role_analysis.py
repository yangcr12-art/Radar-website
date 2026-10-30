from __future__ import annotations

import copy
import unittest
from unittest.mock import patch

from server_core.services.defender_role_analysis import (
    DEFENDER_CONFIGS, DEFENDER_ANALYSIS_COLUMNS, DEFENDER_ROLE_IDS,
    _defender_role_evidence, _fullback_attack_style, defender_method, defender_position_profile, defender_model_eligible, defender_model_sides, defender_compatibility,
)
from server_core.services.scouting_model import SCOUTING_MODELS, evaluate_scouting_role, list_scouting_models


def dataset(family: str, count: int = 12) -> dict:
    columns = set(DEFENDER_ANALYSIS_COLUMNS)
    for role_id in DEFENDER_CONFIGS[family]["roles"]:
        for dimension in SCOUTING_MODELS[role_id]["dimensions"]:
            for metric in dimension["metrics"]:
                columns.update(metric.get("derived", {}).get("columns", []) if metric.get("derived") else [metric["column"]])
    players = []
    for index in range(count):
        raw = {column: float(index + 1) for column in columns}
        raw.update({"Player": f"Defender {index}", "Team": "Test", "Position": "RB" if family == "边后卫" else "CB",
                    "Minutes played": 900, "Matches played": 10, "Total actions per 90": 100,
                    "Passes per 90": 30 + index, "Duels per 90": 10 + index})
        for column in columns:
            if column.endswith("%"):
                raw[column] = 40 + index
        players.append({"id": str(index), "player": raw["Player"], "raw": raw})
    return {"schema": {"allColumns": list(players[0]["raw"])}, "players": players}


class DefenderRoleTest(unittest.TestCase):
    def test_fullback_finishing_six_percent_in_existing_dimensions(self):
        for role_id, dimension_id in (("attacking_wingback", "delivery"), ("inverted_fullback", "progression")):
            model = SCOUTING_MODELS[role_id]
            self.assertEqual(len(model["dimensions"]), 5)
            dimension = next(d for d in model["dimensions"] if d["id"] == dimension_id)
            weights = {m["column"]: m["weight"] for m in dimension["metrics"]}
            self.assertEqual(weights["Non-penalty goals per 90"], 3)
            self.assertEqual(weights["Shots per 90"], 2)
            self.assertEqual(weights["Goal conversion, %"], 1)
            catalog = next(m for m in list_scouting_models() if m["id"] == role_id)
            pair = [m for d in catalog["dimensions"] for m in d["metrics"]
                    if m.get("coupledGroupId") == "finishing_effectiveness"]
            self.assertEqual(len(pair), 2)
            self.assertEqual(sum(m["weight"] for m in pair), 3)
            result = evaluate_scouting_role(dataset("边后卫"), role_id=role_id)
            for player in result["confirmed"]:
                rows = [m for m in player["metrics"] if m.get("coupledGroupId") == "finishing_effectiveness"]
                self.assertEqual(len(rows), 2)
                self.assertEqual(rows[0]["percentile"], rows[1]["percentile"])
                self.assertIsNotNone(rows[0]["coupledComponents"])
                self.assertAlmostEqual(player["score"], 50 + sum(m["contribution"] for m in player["metrics"]), places=1)
        for role_id in ("defensive_fullback", "wingback"):
            columns = {m["column"] for d in SCOUTING_MODELS[role_id]["dimensions"] for m in d["metrics"]}
            self.assertNotIn("Non-penalty goals per 90", columns)
            self.assertNotIn("Goal conversion, %", columns)

    def test_fullback_finishing_correction_and_behavior_separation(self):
        doc = dataset("边后卫")
        doc["players"][0]["raw"].update({"Shots per 90": .1, "Goal conversion, %": 100})
        doc["players"][-1]["raw"].update({"Shots per 90": 10, "Goal conversion, %": 40})
        for role_id in ("attacking_wingback", "inverted_fullback"):
            before = evaluate_scouting_role(doc, role_id=role_id)
            players = {p["id"]: p for p in before["confirmed"]}
            def pair(player_id):
                return next(m for m in players[player_id]["metrics"] if m.get("coupledGroupId") == "finishing_effectiveness")
            self.assertLess(pair("0")["percentile"], pair("11")["percentile"])
            changed = copy.deepcopy(doc)
            for player in changed["players"]:
                player["raw"]["Goal conversion, %"] = 10
                player["raw"]["Non-penalty goals per 90"] = 0
            after = evaluate_scouting_role(changed, role_id=role_id)
            self.assertEqual({p["id"]: p["archetype"] for p in before["confirmed"]},
                             {p["id"]: p["archetype"] for p in after["confirmed"]})
            changed["players"][0]["raw"]["Goal conversion, %"] = ""
            missing = evaluate_scouting_role(changed, role_id=role_id)
            player = next(p for p in missing["confirmed"] if p["id"] == "0")
            rows = [m for m in player["metrics"] if m.get("coupledGroupId") == "finishing_effectiveness"]
            self.assertEqual(len(rows), 2)
            self.assertTrue(all(not m["available"] and m["percentile"] == 50 for m in rows))

    def test_fullback_capability_refinement_weights_and_removed_fields(self):
        totals = {
            "defensive_fullback": [25, 35, 18, 14, 8],
            "attacking_wingback": [13, 27, 24, 18, 18],
            "inverted_fullback": [20, 20, 25, 25, 10],
            "wingback": [15, 25, 20, 25, 15],
        }
        for role_id, expected in totals.items():
            model = SCOUTING_MODELS[role_id]
            self.assertEqual([d["weight"] for d in model["dimensions"]], expected)
            metrics = {m["column"]: m for d in model["dimensions"] for m in d["metrics"]}
            self.assertNotIn("Deep completed crosses per 90", metrics)
            self.assertEqual(sum(m["weight"] for m in metrics.values()), 100)
            if role_id in {"defensive_fullback", "inverted_fullback"}:
                self.assertNotIn("Sprinting Distance per 90 (+25 km/h)", metrics)
            if role_id == "defensive_fullback":
                self.assertNotIn("Progressive passes per 90", metrics)
                self.assertNotIn("Long passes per 90", metrics)
                self.assertEqual(metrics["Losses per 90"]["direction"], "lower")
                self.assertEqual(metrics["Losses per 90"]["weight"], 5)
            if role_id == "attacking_wingback":
                self.assertEqual(metrics["Fouls suffered per 90"]["weight"], 2)

    def test_fullback_defensive_coupling_catalog_and_runtime_agree(self):
        for model in list_scouting_models():
            pair = [m for d in model["dimensions"] for m in d["metrics"]
                    if m.get("coupledGroupId") == "defensive_duel_effectiveness"]
            has_coupling = model["family"] in {"边后卫", "中卫"}
            expected = 1 if model["family"] == "中卫" else 2
            self.assertEqual(len(pair), expected if has_coupling else 0, model["id"])
            if not has_coupling:
                continue
            result = evaluate_scouting_role(dataset(model["family"]), role_id=model["id"])
            player = result["confirmed"][0]
            coupled = [m for m in player["metrics"] if m.get("coupledGroupId") == "defensive_duel_effectiveness"]
            self.assertEqual(len(coupled), expected)
            self.assertEqual(sum(m["weight"] for m in coupled), sum(m["weight"] for m in pair))
            self.assertEqual(coupled[0]["percentile"], coupled[-1]["percentile"])
            self.assertIsNotNone(coupled[0]["coupledComponents"])
            self.assertAlmostEqual(player["score"], 50 + sum(m["contribution"] for m in player["metrics"]), places=1)

    def test_fullback_defensive_coupling_corrects_low_volume_high_success(self):
        doc = dataset("边后卫")
        doc["players"][0]["raw"].update({"Defensive duels per 90": .1, "Defensive duels won, %": 100})
        doc["players"][-1]["raw"].update({"Defensive duels per 90": 20, "Defensive duels won, %": 75})
        for role_id in DEFENDER_CONFIGS["边后卫"]["roles"]:
            result = evaluate_scouting_role(doc, role_id=role_id)
            players = {p["id"]: p for p in result["confirmed"]}
            def pair(player_id):
                return next(m for m in players[player_id]["metrics"] if m.get("coupledGroupId") == "defensive_duel_effectiveness")
            self.assertLess(pair("0")["percentile"], pair("11")["percentile"])
            self.assertLess(pair("0")["coupledComponents"]["adjustedRate"], 100)
        # Success rates change capability, never the behavior classification.
        before = evaluate_scouting_role(doc, role_id="defensive_fullback")
        for player in doc["players"]:
            player["raw"]["Defensive duels won, %"] = 10
        after = evaluate_scouting_role(doc, role_id="defensive_fullback")
        self.assertEqual({p["id"]: p["archetype"] for p in before["confirmed"]},
                         {p["id"]: p["archetype"] for p in after["confirmed"]})

    def test_defensive_fullback_losses_reverse_real_priority_and_missing(self):
        doc = dataset("边后卫")
        result = evaluate_scouting_role(doc, role_id="defensive_fullback")
        players = {p["id"]: p for p in result["confirmed"]}
        def loss(player):
            return next(m for m in player["metrics"] if m["column"] == "Losses per 90")
        self.assertGreater(loss(players["0"])["percentile"], loss(players["11"])["percentile"])
        self.assertEqual(loss(players["0"])["sourceColumns"], ["Losses per 90"])
        doc["schema"]["allColumns"].remove("Losses per 90")
        for player in doc["players"]:
            del player["raw"]["Losses per 90"]
        fallback = evaluate_scouting_role(doc, role_id="defensive_fullback")
        row = loss(next(p for p in fallback["confirmed"] if p["id"] == "0"))
        self.assertAlmostEqual(row["rawValue"], 30 * .60)
        self.assertEqual(row["sourceColumns"], ["Passes per 90", "Accurate passes, %"])
        doc["schema"]["allColumns"].remove("Accurate passes, %")
        missing = evaluate_scouting_role(doc, role_id="defensive_fullback")
        self.assertTrue(all(not loss(p)["available"] for p in missing["confirmed"]))

    def test_fullback_defensive_coupling_missing_rate_does_not_invent_success(self):
        doc = dataset("边后卫")
        doc["players"][0]["raw"]["Defensive duels won, %"] = ""
        result = evaluate_scouting_role(doc, role_id="defensive_fullback")
        player = next(p for p in result["confirmed"] if p["id"] == "0")
        rows = [m for m in player["metrics"] if m.get("coupledGroupId") == "defensive_duel_effectiveness"]
        self.assertTrue(all(not m["available"] and m["percentile"] == 50 for m in rows))
        doc["schema"]["allColumns"].remove("Defensive duels won, %")
        result = evaluate_scouting_role(doc, role_id="defensive_fullback")
        player = next(p for p in result["confirmed"] if p["id"] == "0")
        volume = next(m for m in player["metrics"] if m["column"] == "Defensive duels per 90")
        self.assertEqual(volume["coupledGroupId"], "")
        self.assertTrue(volume["available"])

    def test_balanced_requires_two_strong_and_close_sides(self):
        values = {key: .70 for key in DEFENDER_CONFIGS["边后卫"]["pillars"]}
        original = copy.deepcopy(values)
        balanced = _defender_role_evidence(values, "边后卫")["inverted_fullback"]
        self.assertAlmostEqual(balanced["score"], .70)
        self.assertTrue(balanced["coreStrongEnough"])
        self.assertEqual(values, original)
        for attack, defense in [(.2, .2), (.9, .3), (.3, .9), (.4, .7)]:
            values.update(delivery=attack, carrying=attack, progression=attack, defense=defense)
            self.assertFalse(_defender_role_evidence(values, "边后卫")["inverted_fullback"]["coreStrongEnough"])
        values.update(delivery=.6, carrying=.6, progression=.6, defense=.4)
        self.assertTrue(_defender_role_evidence(values, "边后卫")["inverted_fullback"]["coreStrongEnough"])
        values.pop("carrying")
        self.assertFalse(_defender_role_evidence(values, "边后卫")["inverted_fullback"]["coreAvailable"])

    def test_balanced_organization_auxiliary_and_public_semantics(self):
        values = {key: .70 for key in DEFENDER_CONFIGS["边后卫"]["pillars"]}
        before = _defender_role_evidence(values, "边后卫")["inverted_fullback"]["score"]
        values["connection"] = .90
        after = _defender_role_evidence(values, "边后卫")["inverted_fullback"]["score"]
        self.assertAlmostEqual(after - before, .03)
        values["wingback_compatibility"] = 0
        self.assertAlmostEqual(_defender_role_evidence(values, "边后卫")["inverted_fullback"]["score"], after)
        model = SCOUTING_MODELS["inverted_fullback"]
        self.assertEqual(model["name"], "攻守均衡型边后卫")
        self.assertEqual([d["weight"] for d in model["dimensions"]], [20, 20, 25, 25, 10])
        method = defender_method("边后卫")
        row = next(r for r in method["roles"] if r["id"] == "inverted_fullback")
        self.assertIn("进攻参与", row["formula"])
        self.assertIn("均衡系数", row["formula"])
        self.assertNotIn("内收型", str(method))

    def test_balanced_all_zero_neutral_percentiles_cannot_confirm_role(self):
        doc = dataset("边后卫")
        behavior = DEFENDER_CONFIGS["边后卫"]["pillars"]
        from server_core.services.defender_role_analysis import EVENT_COLUMNS
        for player in doc["players"]:
            for key in ("delivery", "carrying", "progression", "defense"):
                for feature in behavior[key]["features"]:
                    if feature.startswith("event:"):
                        player["raw"][EVENT_COLUMNS[feature.split(":", 1)[1]]] = 0
                    elif feature.startswith("direct:"):
                        player["raw"][feature.split(":", 1)[1]] = 0
            player["raw"]["Forward passes per 90"] = 0
        result = evaluate_scouting_role(doc, role_id="inverted_fullback")
        for player in result["confirmed"]:
            fit = next(f for f in player["archetype"]["fits"] if f["roleId"] == "inverted_fullback")
            self.assertFalse(fit["eligible"])
            self.assertIsNone(player["roleFitScore"])

    def test_attack_style_two_paths_and_boundary(self):
        def rows(scores):
            return [{"id": key, "score": value, "coverage": 1.0} for key, value in scores.items()]
        values = {"delivery": 80, "carrying": 80, "connection": 40, "progression": 40}
        before = copy.deepcopy(values)
        style = _fullback_attack_style(rows(values), set(values))
        self.assertEqual(style["label"], "偏边路输出")
        self.assertEqual(style["scores"], {"偏边路输出": 80, "偏组织推进": 40})
        self.assertEqual(values, before)
        values.update(delivery=80, carrying=60, connection=40, progression=20)
        style = _fullback_attack_style(rows(values), set(values))
        self.assertAlmostEqual(style["scores"]["偏边路输出"], 71)
        self.assertAlmostEqual(style["scores"]["偏组织推进"], 27)
        values.update(delivery=50, carrying=50, connection=60, progression=60)
        self.assertEqual(_fullback_attack_style(rows(values), set(values))["label"], "偏组织推进")
        values.update(connection=59, progression=59)
        self.assertEqual(_fullback_attack_style(rows(values), set(values))["label"], "")
        values.update(delivery=20, carrying=20, connection=40, progression=40)
        self.assertEqual(_fullback_attack_style(rows(values), set(values))["label"], "")

    def test_attack_style_missing_low_coverage_or_zero_behavior_not_inferred(self):
        rows = [{"id": key, "score": 80 if key in {"delivery", "carrying"} else 40, "coverage": 1.0}
                for key in ("delivery", "carrying", "connection", "progression")]
        observed = {row["id"] for row in rows}
        for missing in [None, "delivery", "carrying", "connection", "progression"]:
            altered = copy.deepcopy(rows)
            if missing:
                next(row for row in altered if row["id"] == missing)["score"] = None
            else:
                altered[0]["coverage"] = .49
            self.assertFalse(_fullback_attack_style(altered, observed)["available"])
            self.assertEqual(_fullback_attack_style(altered, observed)["label"], "")
        self.assertEqual(_fullback_attack_style(rows, observed - {"delivery"})["label"], "")

    def test_attack_style_does_not_change_existing_evaluation(self):
        doc = dataset("边后卫")
        original = copy.deepcopy(doc)
        baseline = evaluate_scouting_role(doc, role_id="attacking_wingback")
        with patch("server_core.services.defender_role_analysis._fullback_attack_style", return_value={
                "label": "偏组织推进", "available": True, "scores": {}, "gap": 20, "reason": "测试", "note": "不计分"}):
            tagged = evaluate_scouting_role(doc, role_id="attacking_wingback")
        for result in (baseline, tagged):
            for group in ("confirmed", "pending"):
                for player in result.get(group, []):
                    player["archetype"].pop("attackStyle", None)
        self.assertEqual(baseline, tagged)
        self.assertEqual(doc, original)
        cb = evaluate_scouting_role(dataset("中卫"), role_id="cover_centre_back")
        self.assertTrue(all("attackStyle" not in player["archetype"] for player in cb["confirmed"]))
        self.assertTrue(defender_method("边后卫")["attackStyleRules"])
        self.assertEqual(defender_method("中卫")["attackStyleRules"], [])

    def test_attack_style_hidden_without_supported_main_role(self):
        result = evaluate_scouting_role(dataset("边后卫", count=3), role_id="attacking_wingback")
        self.assertTrue(result["confirmed"])
        self.assertTrue(all(player["archetype"]["attackStyle"]["label"] == "" for player in result["confirmed"]))
        self.assertTrue(all(player["archetype"]["status"] == "insufficient" for player in result["confirmed"]))

    def test_identity_qualification_requires_explicit_same_side_positions(self):
        for position in ["RB, RCB", "LB, LCB", "RCB / RB"]:
            self.assertTrue(defender_model_eligible("wide_centre_back", position))
        for position in ["RCB", "RB, CB", "RB, LCB", "RWB, RCB", "CB"]:
            self.assertFalse(defender_model_eligible("wide_centre_back", position))
        self.assertTrue(defender_model_eligible("wingback", "RB, RWB"))
        self.assertFalse(defender_model_eligible("wingback", "RB"))
        self.assertEqual(defender_model_sides("wingback", "LB, RWB"), ["right"])
        self.assertEqual(defender_model_sides("wide_centre_back", "RB, RCB, LCB"), ["right"])
        self.assertEqual(defender_model_sides("wide_centre_back", "RB, RCB, LB, LCB"), ["left", "right"])

    def test_position_side_is_not_behavior_and_does_not_invent_minutes(self):
        profile = defender_position_profile("RB, RCB", "中卫")
        self.assertEqual(profile["positionIdentity"], "右侧中卫")
        self.assertEqual(profile["positionCompatibility"]["labels"], ["兼容右侧边中卫"])
        self.assertEqual(profile["activitySides"], ["right"])
        self.assertEqual(defender_position_profile("LCB", "中卫")["positionIdentity"], "左侧中卫")
        self.assertEqual(defender_position_profile("CB", "中卫")["activitySides"], ["center"])
        self.assertEqual(defender_position_profile("CB", "中卫", distinguishes_cb_sides=True)["activitySides"], ["center"])
        self.assertEqual(set(defender_position_profile("LB, RB", "边后卫")["activitySides"]), {"left", "right"})

    def test_fourth_roles_keep_full_family_ability_list_and_independent_fit(self):
        for family, role_id, qualifying in [("边后卫", "wingback", "RWB")]:
            doc = dataset(family)
            doc["players"][11]["raw"]["Position"] = qualifying
            result = evaluate_scouting_role(doc, role_id=role_id)
            self.assertEqual(result["summary"]["comparisonCohortCount"], 12)
            self.assertEqual(result["summary"]["confirmedCount"], 12)
            self.assertEqual(result["summary"]["positionQualificationExcludedCount"], 0)
            self.assertFalse(result["settings"]["positionIdentityModel"])
            player = next(p for p in result["confirmed"] if p["id"] == "11")
            self.assertEqual(len(player["archetype"]["fits"]), 4)
            self.assertIsNotNone(player["roleFitScore"])
            self.assertTrue(all(p["roleFitScore"] is None for p in result["confirmed"] if p["id"] != "11"))
            self.assertEqual(len(result["model"]["dimensions"]), 5)
            self.assertEqual(sum(d["weight"] for d in result["model"]["dimensions"]), 100)
            self.assertTrue(any(m["available"] and m["validCohortCount"] == 12 for d in result["model"]["dimensions"] for m in d["metrics"]))
            full = copy.deepcopy(doc)
            for item in full["players"]:
                item["raw"]["Position"] = qualifying
            full_result = evaluate_scouting_role(full, role_id=role_id)
            same = next(p for p in full_result["confirmed"] if p["id"] == player["id"])
            self.assertEqual(player["scoreExact"], same["scoreExact"])
            self.assertEqual(player["archetype"]["fits"], same["archetype"]["fits"])

    def test_cb_identity_does_not_boost_cover_similarity(self):
        doc = dataset("中卫")
        before = evaluate_scouting_role(doc, role_id="cover_centre_back")
        for player in doc["players"]:
            player["raw"]["Position"] = "RCB"
        after = evaluate_scouting_role(doc, role_id="cover_centre_back")
        self.assertEqual({p["id"]: p["archetype"]["fits"] for p in before["confirmed"]}, {p["id"]: p["archetype"]["fits"] for p in after["confirmed"]})

    def test_configuration_and_public_method_share_one_source(self):
        catalog = {model["id"]: model for model in list_scouting_models()}
        for family, config in DEFENDER_CONFIGS.items():
            method = defender_method(family)
            self.assertEqual(len(method["pillars"]), 8)
            self.assertEqual(len(method["roles"]), len(config["roles"]))
            self.assertTrue(method["compatibilityRules"])
            for pillar in method["pillars"]:
                self.assertEqual(sum(metric["weight"] for metric in pillar["metrics"]), 100)
            for role_id, role in config["roles"].items():
                self.assertEqual(catalog[role_id]["roleAnalysis"], method)
                self.assertAlmostEqual(sum(weight for _, weight in role["components"]), 1)
                self.assertEqual(len(catalog[role_id]["dimensions"]), 5)
                self.assertEqual(sum(d["weight"] for d in catalog[role_id]["dimensions"]), 100)
                physical = catalog[role_id]["dimensions"][0]
                self.assertEqual(physical["name"], "身体对抗")
                groups = {m.get("coupledGroupId") for m in physical["metrics"]}
                self.assertTrue({"duel_effectiveness", "aerial_effectiveness"} <= groups)

    def test_core_uses_geometric_mean_and_not_all_eight_pillars(self):
        values = {key: .8 for key in DEFENDER_CONFIGS["边后卫"]["pillars"]}
        values.update(delivery=.9, carrying=.1)
        score = _defender_role_evidence(values, "边后卫")["attacking_wingback"]
        self.assertAlmostEqual(score["coreScore"], .3)
        self.assertAlmostEqual(score["score"], .65 * .3 + .35 * .8)
        values["wingback_compatibility"] = 0
        self.assertEqual(_defender_role_evidence(values, "边后卫")["attacking_wingback"]["score"], score["score"])

    def test_defense_is_direct_core_and_running_cannot_raise_it(self):
        values = {key: .8 for key in DEFENDER_CONFIGS["边后卫"]["pillars"]}
        values.update(defense=.1, physical=1, connection=.5)
        score = _defender_role_evidence(values, "边后卫")["defensive_fullback"]
        self.assertAlmostEqual(score["coreScore"], .1)
        self.assertAlmostEqual(score["score"], (.65 * .1 + .20 + .15 * .5) * .25)
        values["running"] = 0
        self.assertEqual(_defender_role_evidence(values, "边后卫")["defensive_fullback"]["score"], score["score"])

    def test_defense_weights_and_wingback_position_priority(self):
        features = DEFENDER_CONFIGS["边后卫"]["pillars"]["defense"]["features"]
        self.assertEqual(features, {"event:defensive_duels": .30, "event:successful_defensive_actions": .40,
                                    "direct:PAdj Interceptions": .20, "direct:PAdj Sliding tackles": .10})
        role = DEFENDER_CONFIGS["边后卫"]["roles"]["wingback"]
        self.assertEqual(dict(role["components"])["wingback_compatibility"], .50)

    def test_distinct_fullback_behavior_examples(self):
        examples = {
            "defensive_fullback": dict(defense=.9, physical=.7, connection=.4, delivery=.2, carrying=.2, progression=.2, running=.3, wingback_compatibility=.2),
            "attacking_wingback": dict(defense=.3, physical=.4, connection=.3, delivery=.9, carrying=.9, progression=.8, running=.6, wingback_compatibility=.2),
            "inverted_fullback": dict(defense=.7, physical=.4, connection=.9, delivery=.65, carrying=.65, progression=.8, running=.7, wingback_compatibility=.2),
            "wingback": dict(defense=.5, physical=.5, connection=.4, delivery=.7, carrying=.8, progression=.4, running=.9, wingback_compatibility=1),
        }
        for expected, values in examples.items():
            evidence = _defender_role_evidence(values, "边后卫")
            self.assertEqual(max(evidence, key=lambda key: evidence[key]["score"]), expected)

    def test_missing_core_is_not_replaceable_by_auxiliary_evidence(self):
        values = {key: 1 for key in DEFENDER_CONFIGS["中卫"]["pillars"]}
        values.pop("contest")
        result = _defender_role_evidence(values, "中卫")["front_foot_centre_back"]
        self.assertFalse(result["coreAvailable"])
        self.assertIsNone(result["coreScore"])

    def test_missing_core_cannot_rank_by_auxiliary_score(self):
        doc = dataset("边后卫")
        for player in doc["players"]:
            for column in ("Defensive duels per 90", "Successful defensive actions per 90", "PAdj Interceptions", "PAdj Sliding tackles"):
                player["raw"][column] = None
        result = evaluate_scouting_role(doc, role_id="defensive_fullback")
        for player in result["confirmed"]:
            fit = next(f for f in player["archetype"]["fits"] if f["roleId"] == "defensive_fullback")
            self.assertFalse(fit["eligible"])
            self.assertIsNone(player["roleFitScore"])

    def test_eight_roles_have_independent_scores_and_coupled_ability(self):
        for family, config in DEFENDER_CONFIGS.items():
            doc = dataset(family)
            for role_id in config["roles"]:
                result = evaluate_scouting_role(doc, role_id=role_id)
                self.assertTrue(result["ok"])
                self.assertTrue(result["settings"]["defenderExperimentEnabled"])
                self.assertEqual(result["summary"]["comparisonCohortCount"], 12)
                for player in result["confirmed"]:
                    self.assertEqual(len(player["archetype"]["pillars"]), 8)
                    self.assertEqual(len(player["archetype"]["fits"]), len(config["roles"]))
                    if role_id not in {"wingback", "wide_centre_back", "inverted_fullback"}:
                        self.assertIsNotNone(player["roleFitScore"])
                    else:
                        fit = next(f for f in player["archetype"]["fits"] if f["roleId"] == role_id)
                        self.assertEqual(player["roleFitScore"] is not None, fit["eligible"])
                    self.assertTrue(all(0 <= fit["score"] <= 100 for fit in player["archetype"]["fits"]))
                    self.assertTrue(player["archetype"]["classificationNote"])
                    self.assertGreaterEqual(result["summary"]["coupledGroupCount"], 2)

    def test_success_rates_do_not_change_behavior_similarity(self):
        for family, role_id in [("边后卫", "attacking_wingback"), ("中卫", "ball_playing_centre_back")]:
            doc = dataset(family)
            before = evaluate_scouting_role(doc, role_id=role_id)
            changed = copy.deepcopy(doc)
            for player in changed["players"]:
                for column in player["raw"]:
                    if column.endswith("%"):
                        player["raw"][column] = 100 - player["raw"][column]
            after = evaluate_scouting_role(changed, role_id=role_id)
            a = {p["id"]: p["archetype"] for p in before["confirmed"]}
            b = {p["id"]: p["archetype"] for p in after["confirmed"]}
            self.assertEqual(a, b)

    def test_position_order_changes_confidence_not_similarity(self):
        doc = dataset("中卫")
        before = evaluate_scouting_role(doc, role_id="cover_centre_back")
        for player in doc["players"]:
            player["raw"]["Position"] = "DMF, CB"
        after = evaluate_scouting_role(doc, role_id="cover_centre_back")
        a = {p["id"]: p["archetype"] for p in before["confirmed"]}
        for player in after["confirmed"]:
            self.assertEqual(player["archetype"]["fits"], a[player["id"]]["fits"])
            self.assertAlmostEqual(player["archetype"]["dataConfidence"], .75 * a[player["id"]]["dataConfidence"])

    def test_insufficient_cohort_and_explicit_position_pool(self):
        for family, role_id in [("边后卫", "inverted_fullback"), ("中卫", "cover_centre_back")]:
            doc = dataset(family, 7)
            result = evaluate_scouting_role(doc, role_id=role_id)
            self.assertTrue(all(p["archetype"]["status"] == "insufficient" for p in result["confirmed"]))
            for player in doc["players"]:
                player["raw"]["Position"] = "RWF, AMF, DMF"
            result = evaluate_scouting_role(doc, role_id=role_id)
            self.assertEqual(result["summary"]["comparisonCohortCount"], 0)

    def test_position_compatibility_is_last_pillar_and_fourth_role(self):
        for family, role_id, position in [("边后卫", "attacking_wingback", "RWB"), ("中卫", "cover_centre_back", "CB, RB")]:
            doc = dataset(family)
            for player in doc["players"]:
                player["raw"]["Position"] = position
            result = evaluate_scouting_role(doc, role_id=role_id)
            self.assertTrue(all(p["archetype"]["positionProfile"] for p in result["confirmed"]))
            self.assertTrue(all(len(p["archetype"]["fits"]) == (4 if family == "边后卫" else 3) for p in result["confirmed"]))
            self.assertTrue(all(p["archetype"]["pillars"][-1]["id"].endswith("compatibility") for p in result["confirmed"]))

    def test_compatibility_is_absolute_same_side_and_partial_evidence_is_named(self):
        for value in ["RWB, RW", "LWB, LWF"]:
            self.assertEqual(defender_compatibility(value, "边后卫")["score"], 1)
        for value, score in [("RWB", .90), ("RWB, RB", .65), ("LB, LWB", .65), ("RB, RW", .50), ("RB", .20), ("LB, RW", .20)]:
            self.assertEqual(defender_compatibility(value, "边后卫")["score"], score)
        for value, score in [("RB, RCB", 1), ("LB, LCB", 1), ("RB, CB", .50), ("RB, LCB", .20), ("RWB, RCB", .20)]:
            self.assertEqual(defender_compatibility(value, "中卫")["score"], score)
        self.assertIsNone(defender_compatibility("", "中卫")["score"])

    def test_structure_cannot_be_replaced_by_high_behavior(self):
        for family, role_id, key in [("边后卫", "wingback", "wingback_compatibility")]:
            values = {key: 1.0 for key in DEFENDER_CONFIGS[family]["pillars"]}
            values[key] = .20
            evidence = _defender_role_evidence(values, family)[role_id]
            self.assertFalse(evidence["structureAvailable"])
            values[key] = 1.0
            self.assertTrue(_defender_role_evidence(values, family)[role_id]["structureAvailable"])
            values.pop(DEFENDER_CONFIGS[family]["roles"][role_id]["core"][0])
            self.assertFalse(_defender_role_evidence(values, family)[role_id]["coreAvailable"])

    def test_new_role_can_win_with_complete_structure_and_behavior(self):
        for family, role_id, position in [("边后卫", "wingback", "RWB, RW")]:
            doc = dataset(family)
            for player in doc["players"]:
                player["raw"]["Position"] = position
            result = evaluate_scouting_role(doc, role_id=role_id)
            self.assertTrue(any(p["archetype"]["primaryRoleId"] == role_id for p in result["confirmed"]))
            for player in result["confirmed"]:
                fits = player["archetype"]["fits"]
                fit = next(f for f in fits if f["roleId"] == role_id)
                if fit["eligible"]:
                    self.assertAlmostEqual(fit["score"], player["roleFitScore"], delta=.051)
                else:
                    self.assertIsNone(player["roleFitScore"])

    def test_compatibility_does_not_change_old_three_role_scores(self):
        for family, compatibility_key in [("边后卫", "wingback_compatibility"), ("中卫", "wide_cb_compatibility")]:
            values = {key: .80 for key in DEFENDER_CONFIGS[family]["pillars"]}
            before = _defender_role_evidence(values, family)
            values[compatibility_key] = .20
            after = _defender_role_evidence(values, family)
            for role_id in DEFENDER_CONFIGS[family]["roles"]:
                if role_id not in {"wingback", "wide_centre_back"}:
                    self.assertEqual(before[role_id], after[role_id])

    def test_complete_positions_cannot_compensate_weak_required_behavior(self):
        for family, role_id in [("边后卫", "wingback")]:
            values = {key: 1.0 for key in DEFENDER_CONFIGS[family]["pillars"]}
            for key in DEFENDER_CONFIGS[family]["roles"][role_id]["core"]:
                values[key] = .10
            evidence = _defender_role_evidence(values, family)[role_id]
            self.assertTrue(evidence["structureAvailable"])
            self.assertFalse(evidence["coreStrongEnough"])
            doc = dataset(family)
            for player in doc["players"]:
                player["raw"]["Position"] = "RWB, RB" if family == "边后卫" else "RB, RCB"
            result = evaluate_scouting_role(doc, role_id=role_id)
            low = next(p for p in result["confirmed"] if p["id"] == "0")
            self.assertIsNone(low["roleFitScore"])
            fit = next(f for f in low["archetype"]["fits"] if f["roleId"] == role_id)
            self.assertIn("40分", fit["eligibilityReason"])

    def test_defensive_dominance_continuous_and_missing_is_not_zero(self):
        values = {key: .6 for key in DEFENDER_CONFIGS["边后卫"]["pillars"]}
        evidence = _defender_role_evidence(values, "边后卫")["defensive_fullback"]
        self.assertAlmostEqual(evidence["score"] / evidence["baseScore"], .75)
        values["defense"] = .7
        evidence = _defender_role_evidence(values, "边后卫")["defensive_fullback"]
        self.assertAlmostEqual(evidence["score"], evidence["baseScore"])
        values["defense"] = .4
        evidence = _defender_role_evidence(values, "边后卫")["defensive_fullback"]
        self.assertAlmostEqual(evidence["score"] / evidence["baseScore"], .25)
        values.pop("progression")
        evidence = _defender_role_evidence(values, "边后卫")["defensive_fullback"]
        self.assertFalse(evidence["comparisonAvailable"])
        self.assertEqual(evidence["score"], evidence["baseScore"])

    def test_wingback_position_support_requires_behavior_and_proxy_stronger_core(self):
        values = {key: .4 for key in DEFENDER_CONFIGS["边后卫"]["pillars"]}
        values["wingback_compatibility"] = 1
        evidence = _defender_role_evidence(values, "边后卫")["wingback"]
        self.assertAlmostEqual(evidence["behaviorSupport"], .4)
        self.assertAlmostEqual(evidence["score"], .5 * .4 + .3 * .4 + .2 * .4)
        values.update(delivery=.7, running=.7, wingback_compatibility=.5)
        evidence = _defender_role_evidence(values, "边后卫")["wingback"]
        self.assertTrue(evidence["structureAvailable"] and evidence["coreStrongEnough"])
        self.assertAlmostEqual(evidence["behaviorSupport"], 1)
        values.update(delivery=.5, running=.5)
        self.assertFalse(_defender_role_evidence(values, "边后卫")["wingback"]["coreStrongEnough"])

    def test_position_direction_not_token_count_and_left_right_symmetric(self):
        for positions in [("LWB", "RWB", .9), ("LWB,LW", "RWB,RW", 1), ("LWB,LB", "RWB,RB", .65), ("LB,LW", "RB,RW", .5)]:
            for position in positions[:2]:
                self.assertEqual(defender_compatibility(position, "边后卫")["score"], positions[2])
                self.assertEqual(defender_compatibility(",".join(reversed(position.split(","))), "边后卫")["score"], positions[2])

    def test_proxy_can_enter_wingback_fit_without_changing_ability_or_confidence(self):
        doc = dataset("边后卫")
        for player in doc["players"]:
            player["raw"]["Position"] = "LB,LW"
        proxy = evaluate_scouting_role(doc, role_id="wingback")
        self.assertTrue(any(p["roleFitScore"] is not None for p in proxy["confirmed"]))
        for player in doc["players"]:
            player["raw"]["Position"] = "LB,LWB"
        explicit = evaluate_scouting_role(doc, role_id="wingback")
        for before, after in zip(proxy["confirmed"], explicit["confirmed"]):
            self.assertEqual(before["rawScore"], after["rawScore"])
            self.assertEqual(before["archetype"]["dataConfidence"], after["archetype"]["dataConfidence"])

    def test_replaced_behavior_features_are_preserved_in_progression(self):
        self.assertNotIn("creation", DEFENDER_CONFIGS["边后卫"]["pillars"])
        self.assertNotIn("carrying", DEFENDER_CONFIGS["中卫"]["pillars"])
        self.assertTrue({"event:key_passes", "event:shot_assists", "event:penalty_area_passes"} <= set(DEFENDER_CONFIGS["边后卫"]["pillars"]["progression"]["features"]))
        self.assertTrue({"event:progressive_runs", "event:dribbles", "event:offensive_duels"} <= set(DEFENDER_CONFIGS["中卫"]["pillars"]["progression"]["features"]))

    def test_zero_required_activity_does_not_become_role_from_neutral_ties(self):
        for family, role_id, zero_columns, position in [
            ("边后卫", "wingback", ["Crosses per 90", "Crosses to goalie box per 90"], "RWB, RB"),
        ]:
            doc = dataset(family)
            for player in doc["players"]:
                player["raw"]["Position"] = position
                for column in zero_columns:
                    player["raw"][column] = 0
            result = evaluate_scouting_role(doc, role_id=role_id)
            for player in result["confirmed"]:
                fit = next(f for f in player["archetype"]["fits"] if f["roleId"] == role_id)
                self.assertFalse(fit["eligible"])
                self.assertIsNone(player["roleFitScore"])
                self.assertNotEqual(player["archetype"]["primaryRoleId"], role_id)


    def test_centre_back_v5_weights_and_coupling_scope(self):
        catalog = {m["id"]: m for m in list_scouting_models()}
        for role_id, totals, pair_weight in [
            ("front_foot_centre_back", [30, 35, 15, 12, 8], 3),
            ("ball_playing_centre_back", [25, 30, 25, 15, 5], 16),
            ("cover_centre_back", [35, 30, 15, 12, 8], 4),
        ]:
            model = catalog[role_id]
            self.assertEqual([d["weight"] for d in model["dimensions"]], totals)
            self.assertEqual(sum(totals), 100)
            metrics = {m["column"]: m for d in model["dimensions"] for m in d["metrics"]}
            long_pair = [m for m in metrics.values() if m.get("coupledGroupId") == "long_pass_effectiveness"]
            self.assertEqual(len(long_pair), 2)
            self.assertEqual(sum(m["weight"] for m in long_pair), pair_weight)
            if role_id == "ball_playing_centre_back":
                for column in ("Dribbles per 90", "Successful dribbles, %", "Passes per 90", "Received passes per 90"):
                    self.assertNotIn(column, metrics)
                self.assertEqual(metrics["Progressive passes per 90"]["weight"], 9)
            if role_id == "front_foot_centre_back":
                self.assertEqual(metrics["PAdj Sliding tackles"]["weight"], 7)
                self.assertEqual(sum(m["weight"] for m in metrics.values() if m.get("coupledGroupId") == "defensive_duel_effectiveness"), 18)
            expected_rates = {"front_foot_centre_back": [12, 16, 18], "ball_playing_centre_back": [10, 13, 8], "cover_centre_back": [13, 20, 15]}[role_id]
            for column, weight in zip(("Duels won, %", "Aerial duels won, %", "Defensive duels won, %"), expected_rates):
                self.assertEqual(metrics[column]["weight"], weight)
                self.assertIn("次数仅用于可靠度", metrics[column]["coupledFormula"])
            for column in ("Duels per 90", "Aerial duels per 90", "Defensive duels per 90"):
                self.assertNotIn(column, metrics)
        for model in catalog.values():
            has_long_pair = any(m.get("coupledGroupId") == "long_pass_effectiveness" for d in model["dimensions"] for m in d["metrics"])
            self.assertEqual(has_long_pair, model["family"] in {"中卫", "门将"}, model["id"])

    def test_centre_back_rate_only_math_and_missing_evidence(self):
        pairs = [("duel_effectiveness", "Duels per 90", "Duels won, %"),
                 ("aerial_effectiveness", "Aerial duels per 90", "Aerial duels won, %"),
                 ("defensive_duel_effectiveness", "Defensive duels per 90", "Defensive duels won, %")]
        for role_id in DEFENDER_CONFIGS["中卫"]["roles"]:
            for group, volume, rate in pairs:
                doc = dataset("中卫")
                doc["players"][0]["raw"].update({volume: .1, rate: 100})
                doc["players"][-1]["raw"].update({volume: 20, rate: 80})
                result = evaluate_scouting_role(doc, role_id=role_id)
                players = {p["id"]: p for p in result["confirmed"]}
                attempts = [p["raw"][volume] * p["raw"]["Minutes played"] / 90 for p in doc["players"]]
                prior = sum(n * p["raw"][rate] for n, p in zip(attempts, doc["players"])) / sum(attempts)
                def row(player):
                    return next(m for m in player["metrics"] if m.get("coupledGroupId") == group)
                self.assertLess(row(players["0"])["percentile"], row(players["11"])["percentile"])
                for p in players.values():
                    r = row(p)
                    self.assertEqual(r["percentile"], r["coupledComponents"]["rateScore"])
                    original = doc["players"][int(p["id"])]["raw"]
                    self.assertEqual(r["rawSources"], [
                        {"column": volume, "value": original[volume], "unit": "per90"},
                        {"column": rate, "value": original[rate], "unit": "percent"}])
                    n = attempts[int(p["id"])]
                    self.assertAlmostEqual(r["coupledComponents"]["adjustedRate"], (n * original[rate] + 20 * prior) / (n + 20))
                    self.assertAlmostEqual(p["score"], 50 + sum(m["contribution"] for m in p["metrics"]), places=1)
                changed = copy.deepcopy(doc)
                for p in changed["players"]:
                    p["raw"][rate] = 95
                after_rate = evaluate_scouting_role(changed, role_id=role_id)
                self.assertEqual({p["id"]: p["archetype"] for p in result["confirmed"]},
                                 {p["id"]: p["archetype"] for p in after_rate["confirmed"]})
                for invalid in (0, ""):
                    doc["players"][0]["raw"][volume] = invalid
                    after = evaluate_scouting_role(doc, role_id=role_id)
                    p = next(p for p in after["confirmed"] if p["id"] == "0")
                    self.assertFalse(row(p)["available"])
                    self.assertEqual(row(p)["percentile"], 50)
                    self.assertEqual(row(p)["rawSources"][0]["value"], 0 if invalid == 0 else None)
                    self.assertEqual(row(p)["rawSources"][1]["value"], 100)
                # Without the volume column there must be no raw-rate fallback.
                doc["schema"]["allColumns"].remove(volume)
                for p in doc["players"]:
                    p["raw"].pop(volume, None)
                after = evaluate_scouting_role(doc, role_id=role_id)
                self.assertTrue(all(not row(p)["available"] for p in after["confirmed"]))
                small = evaluate_scouting_role(dataset("中卫", count=7), role_id=role_id)
                self.assertTrue(all(not row(p)["available"] for p in small["confirmed"]))

    def test_centre_back_long_pair_reliability_missing_and_contribution(self):
        for role_id in DEFENDER_CONFIGS["中卫"]["roles"]:
            doc = dataset("中卫")
            doc["players"][0]["raw"].update({"Long passes per 90": .1, "Accurate long passes, %": 100})
            doc["players"][-1]["raw"].update({"Long passes per 90": 20, "Accurate long passes, %": 75})
            before = evaluate_scouting_role(doc, role_id=role_id)
            players = {p["id"]: p for p in before["confirmed"]}
            def pair(player):
                return [m for m in player["metrics"] if m.get("coupledGroupId") == "long_pass_effectiveness"]
            self.assertLess(pair(players["0"])[0]["percentile"], pair(players["11"])[0]["percentile"])
            self.assertLess(pair(players["0"])[0]["coupledComponents"]["adjustedRate"], 100)
            for player in players.values():
                rows = pair(player)
                self.assertEqual(len(rows), 2)
                self.assertEqual(rows[0]["percentile"], rows[1]["percentile"])
                self.assertAlmostEqual(player["score"], 50 + sum(m["contribution"] for m in player["metrics"]), places=1)
            doc["players"][0]["raw"]["Accurate long passes, %"] = ""
            after = evaluate_scouting_role(doc, role_id=role_id)
            low = next(p for p in after["confirmed"] if p["id"] == "0")
            self.assertTrue(all(not m["available"] and m["percentile"] == 50 for m in pair(low)))
            self.assertEqual({p["id"]: p["archetype"] for p in before["confirmed"]}, {p["id"]: p["archetype"] for p in after["confirmed"]})

    def test_centre_back_compatibility_is_non_scoring_and_has_three_roles(self):
        doc = dataset("中卫")
        before = evaluate_scouting_role(doc, role_id="cover_centre_back")
        for player in doc["players"]:
            player["raw"]["Position"] = "CB, RCB, RB, LCB, LB"
        after = evaluate_scouting_role(doc, role_id="cover_centre_back")
        by_id = {p["id"]: p for p in before["confirmed"]}
        for player in after["confirmed"]:
            old = by_id[player["id"]]
            self.assertEqual(player["scoreExact"], old["scoreExact"])
            self.assertEqual(player["archetype"]["fits"], old["archetype"]["fits"])
            self.assertEqual(player["archetype"]["dataConfidence"], old["archetype"]["dataConfidence"])
            self.assertEqual(len(player["archetype"]["fits"]), 3)
            self.assertNotEqual(player["archetype"]["primaryRoleId"], "wide_centre_back")
            self.assertIsNone(player["archetype"]["pillars"][-1]["score"])
            self.assertIsNone(player["archetype"]["compatibilityEvidence"]["score"])
            self.assertEqual(player["archetype"]["positionCompatibility"]["wideSides"], ["left", "right"])
            self.assertTrue(player["archetype"]["positionCompatibility"]["center"])
        self.assertNotIn("wide_centre_back", {m["id"] for m in list_scouting_models()})
        legacy = evaluate_scouting_role(doc, role_id="wide_centre_back")
        self.assertTrue(legacy["ok"])
        self.assertTrue(all(p["roleFitScore"] is None and len(p["archetype"]["fits"]) == 3 for p in legacy["confirmed"]))

    def test_centre_and_same_side_compatibility_boundaries(self):
        cases = [("CB", True, [], False), ("CB, RB", True, [], True),
                 ("RB, RCB", False, ["right"], False), ("LB, LCB", False, ["left"], False),
                 ("RB, LCB", False, [], False), ("RWB, RCB", False, [], False),
                 ("", False, [], False)]
        for position, center, sides, pending in cases:
            evidence = defender_position_profile(position, "中卫")["positionCompatibility"]
            self.assertEqual((evidence["center"], evidence["wideSides"], evidence["pendingWide"]), (center, sides, pending))


if __name__ == "__main__":
    unittest.main()
