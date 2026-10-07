from __future__ import annotations

from bisect import bisect_left, bisect_right
from math import log1p
from typing import Any

from server_core.services.percentile_algorithm import EVENT_NEGATIVE, EVENT_POSITIVE


ZERO_EPSILON = 1e-12
BASE_SMOOTHING_ALPHA = 1.0
MAX_SMOOTHING_ALPHA = 6.0
EVENT_ZERO_SCORE_CAP = 8.0
EVENT_POSITIVE_FLOOR_BASE = 50.0
EVENT_POSITIVE_FLOOR_ZERO_BONUS = 25.0
EVENT_RANK_WEIGHT = 0.75
EVENT_INTENSITY_WEIGHT = 0.25


def smoothing_profile(sorted_values: list[float]) -> dict[str, Any]:
    count = len(sorted_values)
    if count == 0:
        return {
            "alpha": BASE_SMOOTHING_ALPHA,
            "zeroCount": 0,
            "zeroShare": 0.0,
            "zeroFloorPercentile": None,
            "smallSampleAdjustment": 0.0,
            "sparseAdjustment": 0.0,
            "reason": "无有效样本，回退中性50分。",
        }

    zero_count = sum(1 for value in sorted_values if abs(value) <= ZERO_EPSILON)
    zero_share = zero_count / count
    non_negative = min(sorted_values) >= -ZERO_EPSILON
    small_sample_adjustment = max(0.0, (20.0 - count) / 10.0)
    sparse_adjustment = max(0.0, (zero_share - 0.4) * 10.0) if non_negative else 0.0
    alpha = min(MAX_SMOOTHING_ALPHA, BASE_SMOOTHING_ALPHA + small_sample_adjustment + sparse_adjustment)
    zero_floor_percentile = min(50.0 * zero_share, 50.0 * (1.0 - zero_share)) if non_negative and zero_count else None

    reasons = [f"基础平滑 α={BASE_SMOOTHING_ALPHA:.1f}"]
    if small_sample_adjustment > 0:
        reasons.append(f"样本少于20人 +{small_sample_adjustment:.2f}")
    if sparse_adjustment > 0:
        reasons.append(f"零值占比{zero_share:.0%} +{sparse_adjustment:.2f}")
    if zero_floor_percentile is not None:
        reasons.append(f"真实零值不抬升，零值门槛基准{zero_floor_percentile:.1f}")
    return {
        "alpha": alpha,
        "zeroCount": zero_count,
        "zeroShare": zero_share,
        "zeroFloorPercentile": zero_floor_percentile,
        "smallSampleAdjustment": small_sample_adjustment,
        "sparseAdjustment": sparse_adjustment,
        "reason": "；".join(reasons),
    }


def percentile_pair(
    sorted_values: list[float],
    value: float,
    *,
    higher_is_better: bool = True,
    alpha: float | None = None,
) -> dict[str, float]:
    count = len(sorted_values)
    if count == 0:
        return {"rawPercentile": 50.0, "adjustedPercentile": 50.0}

    left = bisect_left(sorted_values, value)
    right = bisect_right(sorted_values, value)
    equal_count = max(1, right - left)
    midrank = left + 0.5 * equal_count
    raw = midrank / count * 100.0

    effective_alpha = float(alpha if alpha is not None else smoothing_profile(sorted_values)["alpha"])
    adjusted = (midrank + effective_alpha) / (count + 2.0 * effective_alpha) * 100.0
    if min(sorted_values) >= -ZERO_EPSILON and abs(value) <= ZERO_EPSILON:
        zero_share = sum(1 for item in sorted_values if abs(item) <= ZERO_EPSILON) / count
        zero_floor = 50.0 * (1.0 - zero_share)
        adjusted = min(adjusted, raw, zero_floor)
    if not higher_is_better:
        raw = 100.0 - raw
        adjusted = 100.0 - adjusted
    return {"rawPercentile": raw, "adjustedPercentile": adjusted}


def event_percentile_pair(
    sorted_values: list[float],
    value: float,
    *,
    higher_is_better: bool = True,
) -> dict[str, float]:
    count = len(sorted_values)
    if count == 0:
        return {"rawPercentile": 50.0, "adjustedPercentile": 50.0}

    ordinary = percentile_pair(sorted_values, value, higher_is_better=higher_is_better, alpha=0.0)
    non_negative_values = [item for item in sorted_values if item >= -ZERO_EPSILON]
    if len(non_negative_values) != count:
        return ordinary

    # A constant cohort has no ranking information. Keep it neutral instead of
    # rewarding every tied maximum or penalising every tied zero.
    if sorted_values[-1] - sorted_values[0] <= ZERO_EPSILON:
        return {"rawPercentile": ordinary["rawPercentile"], "adjustedPercentile": 50.0}

    zero_count = sum(1 for item in sorted_values if abs(item) <= ZERO_EPSILON)
    positive_values = [item for item in sorted_values if item > ZERO_EPSILON]
    zero_share = zero_count / count

    if abs(value) <= ZERO_EPSILON:
        adjusted = EVENT_ZERO_SCORE_CAP * (zero_share ** 2)
    elif value > ZERO_EPSILON and positive_values:
        positive_sorted = sorted(positive_values)
        left = bisect_left(positive_sorted, value)
        right = bisect_right(positive_sorted, value)
        equal_count = max(1, right - left)
        if len(positive_sorted) == 1:
            positive_rank = 1.0
        else:
            # Zero-based tie midpoint keeps the smallest unique positive at 0,
            # while a tied minimum reflects how many positive observations share it.
            positive_rank = (left + 0.5 * (equal_count - 1)) / (len(positive_sorted) - 1)
        max_positive = positive_sorted[-1]
        intensity = log1p(value) / log1p(max_positive) if max_positive > ZERO_EPSILON else 0.0
        positive_floor = EVENT_POSITIVE_FLOOR_BASE + EVENT_POSITIVE_FLOOR_ZERO_BONUS * zero_share
        blended_position = EVENT_RANK_WEIGHT * positive_rank + EVENT_INTENSITY_WEIGHT * intensity
        adjusted = positive_floor + (100.0 - positive_floor) * blended_position
        if value >= max_positive - ZERO_EPSILON:
            adjusted = 100.0
    else:
        return ordinary

    adjusted = max(0.0, min(100.0, adjusted))
    if not higher_is_better:
        adjusted = 100.0 - adjusted
    return {"rawPercentile": ordinary["rawPercentile"], "adjustedPercentile": adjusted}


def percentile_pair_for_algorithm(
    sorted_values: list[float],
    value: float,
    *,
    algorithm: str,
    alpha: float | None = None,
) -> dict[str, float]:
    if algorithm in {EVENT_POSITIVE, EVENT_NEGATIVE}:
        return event_percentile_pair(
            sorted_values,
            value,
            higher_is_better=algorithm == EVENT_POSITIVE,
        )
    return percentile_pair(
        sorted_values,
        value,
        higher_is_better=algorithm != "standard_negative",
        alpha=alpha,
    )
