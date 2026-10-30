from __future__ import annotations

import copy
import unittest

from server_core.services.goalkeeper_role_analysis import GOALKEEPER_ANALYSIS_COLUMNS, GOALKEEPER_ROLE_IDS, goalkeeper_method
from server_core.services.scouting_model import SCOUTING_MODELS, evaluate_scouting_role, list_scouting_models


def dataset(count=16):
    columns = set(GOALKEEPER_ANALYSIS_COLUMNS)
    for role_id in GOALKEEPER_ROLE_IDS:
        for dimension in SCOUTING_MODELS[role_id]["dimensions"]:
            for metric in dimension["metrics"]:
                columns.add(metric["column"])
    players = []
    for i in range(count):
        raw = {column: float(i+1) for column in columns}
        raw.update({"Position": "GK", "Player": f"Keeper {i}", "Minutes played": 900, "Matches played": 10,
            "Passes per 90": 20+i*2, "Long passes per 90": 10+i*.2,
            "Short / medium passes per 90": 10+i*1.8,
            "Back passes received as GK per 90": 2+i, "Received passes per 90": 10+i,
            "Shots against per 90": count-i, "Exits per 90": i*.1,
            "Aerial duels per 90": 1+i*.1, "Prevented goals per 90": -.2+i*.03})
        for key in columns:
            if key.endswith("%"):
                raw[key] = 55+i
        players.append({"id": str(i), "player": raw["Player"], "raw": raw})
    return {"schema": {"allColumns": list(players[0]["raw"])}, "players": players}


class GoalkeeperTest(unittest.TestCase):
    def test_catalog_and_four_dimensions(self):
        models = {m["id"]: m for m in list_scouting_models()}
        self.assertEqual({m["id"] for m in models.values() if m["family"] == "门将"}, GOALKEEPER_ROLE_IDS)
        for role_id, totals in [("shot_stopping_goalkeeper", [55, 15, 12, 18]), ("ball_playing_goalkeeper", [35, 10, 25, 30])]:
            model = models[role_id]
            self.assertEqual([d["weight"] for d in model["dimensions"]], totals)
            self.assertEqual(sum(totals), 100)
            self.assertEqual(len(model["roleAnalysis"]["pillars"]), 8)
            self.assertEqual(len(model["roleAnalysis"]["roles"]), 2)
            metrics = [m for d in model["dimensions"] for m in d["metrics"]]
            self.assertNotIn("Conceded goals per 90", {m["column"] for m in metrics})
            self.assertNotIn("Losses per 90", {m["column"] for m in metrics})
            self.assertNotIn("Fouls per 90", {m["column"] for m in metrics})
            self.assertNotIn("discipline", {d["id"] for d in model["dimensions"]})
            if role_id == "shot_stopping_goalkeeper":
                weights = {m["column"]: m["weight"] for d in SCOUTING_MODELS[role_id]["dimensions"] for m in d["metrics"]}
                self.assertEqual(weights["Save rate, %"], 25)
                self.assertEqual(weights["Prevented goals per 90"], 30)
            self.assertEqual({m["coupledGroupId"] for m in metrics if m["coupledGroupId"]},
                             {"long_pass_effectiveness", "duel_effectiveness", "aerial_effectiveness"})

    def test_two_fits_quality_independence_and_closure(self):
        doc = dataset()
        for role_id in GOALKEEPER_ROLE_IDS:
            result = evaluate_scouting_role(doc, role_id=role_id)
            self.assertTrue(result["settings"]["roleSimilarityEnabled"])
            for p in result["confirmed"]:
                self.assertEqual(len(p["archetype"]["pillars"]), 8)
                self.assertEqual(len(p["archetype"]["fits"]), 2)
                self.assertTrue(all(0 <= f["score"] <= 100 for f in p["archetype"]["fits"]))
                self.assertAlmostEqual(p["score"], 50 + sum(m["contribution"] for m in p["metrics"]), places=1)
            altered = copy.deepcopy(doc)
            for p in altered["players"]:
                for key in p["raw"]:
                    if key.endswith("%"):
                        p["raw"][key] = 98
                p["raw"]["Prevented goals per 90"] = 4
                p["raw"]["Conceded goals per 90"] = 0
            after = evaluate_scouting_role(altered, role_id=role_id)
            self.assertEqual({p["id"]: p["archetype"] for p in result["confirmed"]}, {p["id"]: p["archetype"] for p in after["confirmed"]})

    def test_behavior_examples_and_no_probability_normalization(self):
        result = evaluate_scouting_role(dataset(), role_id="ball_playing_goalkeeper")
        players = {p["id"]: p for p in result["confirmed"]}
        self.assertEqual(players["15"]["archetype"]["primaryRoleId"], "ball_playing_goalkeeper")
        self.assertEqual(players["0"]["archetype"]["primaryRoleId"], "shot_stopping_goalkeeper")
        self.assertNotAlmostEqual(sum(f["score"] for f in players["15"]["archetype"]["fits"]), 100)

    def test_missing_zero_bad_ratios_and_small_cohort(self):
        for scenario in ("missing", "zero", "bad_ratio", "small"):
            doc = dataset(7 if scenario == "small" else 16)
            for p in doc["players"]:
                if scenario == "missing":
                    p["raw"].pop("Short / medium passes per 90")
                elif scenario == "zero":
                    for key in GOALKEEPER_ANALYSIS_COLUMNS:
                        p["raw"][key] = 0
                elif scenario == "bad_ratio":
                    p["raw"]["Long passes per 90"] = 1000
                    p["raw"]["Short / medium passes per 90"] = 1000
            result = evaluate_scouting_role(doc, role_id="ball_playing_goalkeeper")
            for p in result["confirmed"]:
                self.assertIsNone(p["roleFitScore"])
                self.assertFalse(next(f for f in p["archetype"]["fits"] if f["roleId"] == "ball_playing_goalkeeper")["eligible"])
                self.assertEqual(p["archetype"]["label"], "数据不足")

    def test_backpass_not_required_and_shot_load_only_auxiliary(self):
        doc = dataset()
        before = evaluate_scouting_role(doc, role_id="ball_playing_goalkeeper")
        for p in doc["players"]:
            p["raw"].pop("Back passes received as GK per 90", None)
        after = evaluate_scouting_role(doc, role_id="ball_playing_goalkeeper")
        self.assertEqual([p["archetype"] for p in before["confirmed"]], [p["archetype"] for p in after["confirmed"]])
        original = {p["id"]: p["archetype"] for p in after["confirmed"]}
        for p in doc["players"]:
            p["raw"]["Shots against per 90"] = 0
        altered = evaluate_scouting_role(doc, role_id="ball_playing_goalkeeper")
        for p in altered["confirmed"]:
            old = {f["roleId"]: f for f in original[p["id"]]["fits"]}
            new = {f["roleId"]: f for f in p["archetype"]["fits"]}
            self.assertEqual(old["ball_playing_goalkeeper"], new["ball_playing_goalkeeper"])
            self.assertEqual(old["shot_stopping_goalkeeper"]["eligible"], new["shot_stopping_goalkeeper"]["eligible"])
            self.assertLessEqual(abs(old["shot_stopping_goalkeeper"]["score"]-new["shot_stopping_goalkeeper"]["score"]), 5)

    def test_low_organization_without_direct_evidence_is_not_shot_stopper(self):
        doc = dataset()
        for p in doc["players"]:
            p["raw"]["Long passes per 90"] = 0
        result = evaluate_scouting_role(doc, role_id="shot_stopping_goalkeeper")
        self.assertTrue(all(not next(f for f in p["archetype"]["fits"] if f["roleId"] == "shot_stopping_goalkeeper")["eligible"] for p in result["confirmed"]))

    def test_position_pool_and_position_reliability(self):
        doc = dataset()
        doc["players"][0]["raw"]["Position"] = "CB"
        doc["players"][1]["raw"]["Position"] = "CB, GK"
        result = evaluate_scouting_role(doc, role_id="ball_playing_goalkeeper")
        players = {p["id"]: p for p in result["confirmed"]}
        self.assertNotIn("0", players)
        self.assertEqual(players["1"]["archetype"]["positionReliability"], .75)
        self.assertEqual(players["2"]["archetype"]["positionReliability"], 1)
        self.assertEqual(len(goalkeeper_method()["pillars"]), 8)


if __name__ == "__main__":
    unittest.main()
