from __future__ import annotations

import unittest

from server_core.services.percentile_algorithm import default_percentile_algorithm
from server_core.services.percentile_service import event_percentile_pair, percentile_pair, smoothing_profile


class PercentileServiceTest(unittest.TestCase):
    def test_sparse_small_sample_is_shrunk_toward_50(self):
        values = sorted([0.0] * 8 + [1.0, 10.0])
        profile = smoothing_profile(values)

        self.assertEqual(profile["alpha"], 6.0)
        self.assertEqual(profile["zeroShare"], 0.8)
        self.assertAlmostEqual(percentile_pair(values, 0.0, alpha=profile["alpha"])["adjustedPercentile"], 10.0, places=4)
        self.assertAlmostEqual(percentile_pair(values, 1.0, alpha=profile["alpha"])["rawPercentile"], 85.0, places=4)
        self.assertAlmostEqual(percentile_pair(values, 1.0, alpha=profile["alpha"])["adjustedPercentile"], 65.9091, places=4)
        self.assertAlmostEqual(percentile_pair(values, 10.0, alpha=profile["alpha"])["adjustedPercentile"], 70.4545, places=4)

    def test_lower_is_better_inverts_both_percentiles(self):
        values = [1.0, 2.0, 3.0, 4.0]
        higher = percentile_pair(values, 1.0, higher_is_better=True, alpha=1.0)
        lower = percentile_pair(values, 1.0, higher_is_better=False, alpha=1.0)

        self.assertAlmostEqual(higher["rawPercentile"] + lower["rawPercentile"], 100.0)
        self.assertAlmostEqual(higher["adjustedPercentile"] + lower["adjustedPercentile"], 100.0)

    def test_six_zeros_then_one_and_two_scores_zero_just_below_neutral(self):
        values = sorted([0.0] * 6 + [1.0, 2.0])
        profile = smoothing_profile(values)
        percentiles = percentile_pair(values, 0.0, alpha=profile["alpha"])

        self.assertAlmostEqual(profile["alpha"], 5.7)
        self.assertAlmostEqual(percentiles["rawPercentile"], 37.5)
        self.assertAlmostEqual(percentiles["adjustedPercentile"], 12.5, places=5)
        self.assertAlmostEqual(percentile_pair(values, 1.0, alpha=profile["alpha"])["adjustedPercentile"], 62.8866, places=4)
        self.assertAlmostEqual(percentile_pair(values, 2.0, alpha=profile["alpha"])["adjustedPercentile"], 68.0412, places=4)

    def test_sparse_event_keeps_zero_low_and_anchors_maximum_at_100(self):
        values = sorted([0.0] * 15 + [1.0, 1.0, 2.0, 2.0, 3.0])

        zero = event_percentile_pair(values, 0.0)
        one = event_percentile_pair(values, 1.0)
        maximum = event_percentile_pair(values, 3.0)

        self.assertAlmostEqual(zero["adjustedPercentile"], 4.5, places=4)
        self.assertAlmostEqual(one["adjustedPercentile"], 75.5859, places=4)
        self.assertEqual(maximum["adjustedPercentile"], 100.0)

    def test_sparse_event_matches_approved_zero_heavy_example(self):
        values = sorted([
            0.14, 0, 0.04, 0, 0, 0.21, 0.04, 0, 0, 0, 0, 0, 0.15, 0.04,
            0.1, 0, 0.04, 0, 0.23, 0, 0, 0, 0.1, 0, 0, 0.09, 0.06, 0.07,
            0, 0, 0, 0, 0.04, 0, 0, 0.04, 0.05, 0.04, 0.05, 0, 0.07, 0,
            0, 0, 0, 0, 0.08, 0, 0.27,
        ])

        self.assertAlmostEqual(event_percentile_pair(values, 0.0)["adjustedPercentile"], 2.6122, places=4)
        self.assertAlmostEqual(event_percentile_pair(values, 0.04)["adjustedPercentile"], 69.7687, places=4)
        self.assertAlmostEqual(event_percentile_pair(values, 0.14)["adjustedPercentile"], 90.6089, places=4)
        self.assertEqual(event_percentile_pair(values, 0.27)["adjustedPercentile"], 100.0)

    def test_sparse_event_negative_is_exact_inverse(self):
        values = sorted([0.0] * 6 + [1.0, 2.0])

        for value in (0.0, 1.0, 2.0):
            positive = event_percentile_pair(values, value, higher_is_better=True)
            negative = event_percentile_pair(values, value, higher_is_better=False)
            self.assertAlmostEqual(
                positive["adjustedPercentile"] + negative["adjustedPercentile"],
                100.0,
            )

    def test_constant_sparse_event_cohort_is_neutral(self):
        for values in ([0.0] * 8, [1.0] * 8):
            pair = event_percentile_pair(values, values[0])
            self.assertEqual(pair["rawPercentile"], 50.0)
            self.assertEqual(pair["adjustedPercentile"], 50.0)

    def test_default_algorithms_distinguish_foul_and_foul_suffered(self):
        self.assertEqual(default_percentile_algorithm("Fouls per 90"), "standard_negative")
        self.assertEqual(default_percentile_algorithm("Fouls suffered per 90"), "standard_positive")
        self.assertEqual(default_percentile_algorithm("Key passes per 90"), "event_positive")
        self.assertEqual(default_percentile_algorithm("Red cards per 90"), "event_negative")


if __name__ == "__main__":
    unittest.main()
