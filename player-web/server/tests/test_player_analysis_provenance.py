import unittest
from server_core.services.ranking_service import compute_player_metrics
from server_core.services.player_dataset_store import build_player_columns

class PlayerAnalysisProvenanceTest(unittest.TestCase):
    def test_valid_count_excludes_missing_and_preserves_percentiles(self):
        players = [{"raw": {"Shots per 90": v}} for v in [0, 2, None, 2]]
        compute_player_metrics(players, ["Shots per 90"], lambda v: None if v is None else float(v), algorithm_by_column={"Shots per 90": "standard_positive"})
        columns = build_player_columns(players[0], {"numericColumns": ["Shots per 90"], "allColumns": ["Shots per 90"]})
        self.assertEqual(columns[0]["comparisonCount"], 3)
        self.assertTrue(columns[0]["comparisonHasVariation"])
        self.assertAlmostEqual(columns[0]["rawPercentile"], 16.67)
        self.assertEqual(columns[0]["value"], 0)
        self.assertNotIn("Shots per 90", players[2]["metrics"])

    def test_constant_population_is_explicit(self):
        players = [{"raw": {"a": 1}} for _ in range(10)]
        compute_player_metrics(players, ["a"], float, algorithm_by_column={"a": "standard_positive"})
        self.assertEqual(players[0]["metrics"]["a"]["comparisonCount"], 10)
        self.assertFalse(players[0]["metrics"]["a"]["comparisonHasVariation"])
        self.assertEqual(players[0]["metrics"]["a"]["rawPercentile"], 50)
