#!/usr/bin/env python3
"""Generate grouped radial player charts from a CSV template."""

from __future__ import annotations

import argparse
import csv
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

try:
    import matplotlib.pyplot as plt
    import numpy as np
except ModuleNotFoundError as exc:
    raise SystemExit(
        "Missing dependency. Install with: pip install matplotlib numpy"
    ) from exc


DEFAULT_TIER_COLORS = {
    "elite": "#0f9d58",
    "above_avg": "#b8860b",
    "avg": "#e67e22",
    "bottom": "#d32f2f",
}


@dataclass
class MetricRow:
    metric: str
    value: float
    group: str
    per90: str
    tier: str
    order: int
    color: str | None


def _parse_rows(csv_path: Path) -> list[MetricRow]:
    rows: list[MetricRow] = []
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {"metric", "value", "group", "order"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing required columns: {sorted(missing)}")

        for idx, row in enumerate(reader, start=2):
            try:
                metric = (row.get("metric") or "").strip()
                group = (row.get("group") or "").strip()
                value = float((row.get("value") or "").strip())
                order = int((row.get("order") or "").strip())
            except ValueError as exc:
                raise ValueError(f"Bad numeric value at line {idx}: {exc}") from exc

            if not metric:
                raise ValueError(f"metric is empty at line {idx}")
            if not group:
                raise ValueError(f"group is empty at line {idx}")
            if not (0 <= value <= 100):
                raise ValueError(f"value must be 0..100 at line {idx}")

            per90 = (row.get("per90") or "").strip()
            tier = (row.get("tier") or "avg").strip().lower()
            color = (row.get("color") or "").strip() or None

            rows.append(
                MetricRow(
                    metric=metric,
                    value=value,
                    group=group,
                    per90=per90,
                    tier=tier,
                    order=order,
                    color=color,
                )
            )

    rows.sort(key=lambda r: (r.order, r.group, r.metric))
    return rows


def _group_boundaries(rows: Iterable[MetricRow]) -> list[tuple[int, str]]:
    boundaries: list[tuple[int, str]] = []
    last_group: str | None = None
    for i, row in enumerate(rows):
        if row.group != last_group:
            boundaries.append((i, row.group))
            last_group = row.group
    return boundaries


def _pick_color(row: MetricRow) -> str:
    if row.color:
        return row.color
    return DEFAULT_TIER_COLORS.get(row.tier, DEFAULT_TIER_COLORS["avg"])


def draw_chart(
    rows: list[MetricRow],
    title: str,
    subtitle: str,
    out_path: Path,
    dpi: int,
) -> None:
    n = len(rows)
    if n == 0:
        raise ValueError("No rows loaded from CSV")

    angles = np.linspace(0, 2 * np.pi, n, endpoint=False)
    full_step = (2 * np.pi) / n
    width = full_step * 0.85

    fig, ax = plt.subplots(figsize=(10, 10), subplot_kw={"projection": "polar"})
    fig.patch.set_facecolor("#f8f5ef")
    ax.set_facecolor("#f8f5ef")
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_ylim(0, 115)

    # Keep center empty to match pizza/radial style.
    inner = 22.0
    radial_max = 78.0
    scaled = np.array([r.value for r in rows]) / 100.0 * radial_max

    for r in [20, 40, 60, 80, 100]:
        ax.plot(
            np.linspace(0, 2 * np.pi, 240),
            np.full(240, inner + r / 100.0 * radial_max),
            color="#d0cdc6",
            linewidth=0.8,
            linestyle=(0, (2, 4)),
            alpha=0.8,
            zorder=1,
        )

    for ang, row, bar_h in zip(angles, rows, scaled):
        color = _pick_color(row)
        ax.bar(
            ang,
            bar_h,
            width=width,
            bottom=inner,
            color=color + "33",
            edgecolor=color,
            linewidth=1.2,
            zorder=3,
        )

        label_r = inner + bar_h + 8
        rot = math.degrees(ang)
        align = "left"
        if 90 < rot < 270:
            rot += 180
            align = "right"

        ax.text(
            ang,
            label_r,
            row.metric,
            fontsize=8.2,
            color=color,
            rotation=rot,
            rotation_mode="anchor",
            ha=align,
            va="center",
            zorder=5,
        )

        if row.per90:
            ax.text(
                ang,
                inner + bar_h - 3,
                row.per90,
                fontsize=7.2,
                color="white",
                ha="center",
                va="center",
                bbox=dict(
                    facecolor=color,
                    edgecolor="#222222",
                    boxstyle="round,pad=0.2",
                    linewidth=0.7,
                ),
                zorder=6,
            )

    boundaries = _group_boundaries(rows)
    for idx, name in boundaries:
        boundary_angle = angles[idx] - full_step / 2
        ax.plot(
            [boundary_angle, boundary_angle],
            [inner - 4, inner + radial_max + 12],
            color="#c1bbb2",
            linewidth=1.0,
            alpha=0.8,
            zorder=2,
        )

        end_idx = next((b[0] for b in boundaries if b[0] > idx), n)
        mid_idx = (idx + end_idx - 1) / 2
        mid_angle = angles[int(mid_idx)]
        ax.text(
            mid_angle,
            inner + radial_max + 16,
            name,
            fontsize=9.2,
            fontweight="bold",
            color="#6f675d",
            ha="center",
            va="center",
            zorder=5,
        )

    ax.set_xticks([])
    ax.set_yticks([])
    ax.grid(False)
    ax.spines["polar"].set_visible(False)

    fig.text(0.5, 0.96, title, ha="center", va="top", fontsize=16, fontweight="bold")
    if subtitle:
        fig.text(0.5, 0.93, subtitle, ha="center", va="top", fontsize=11, color="#5f5850")

    legend_items = [
        ("Elite (Top 10%)", DEFAULT_TIER_COLORS["elite"]),
        ("Above Average (11-35%)", DEFAULT_TIER_COLORS["above_avg"]),
        ("Average (36-66%)", DEFAULT_TIER_COLORS["avg"]),
        ("Bottom (Bottom 35%)", DEFAULT_TIER_COLORS["bottom"]),
    ]
    y = 0.075
    for text, color in legend_items:
        fig.text(0.74, y, text, fontsize=8.5, color=color, ha="left")
        y -= 0.02

    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate radial player chart from CSV template."
    )
    parser.add_argument("--input", required=True, help="Path to input CSV template")
    parser.add_argument("--output", required=True, help="Output image path (.png)")
    parser.add_argument("--title", required=True, help="Main title")
    parser.add_argument("--subtitle", default="", help="Subtitle text")
    parser.add_argument("--dpi", type=int, default=220, help="Output DPI (default 220)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows = _parse_rows(Path(args.input))
    draw_chart(
        rows=rows,
        title=args.title,
        subtitle=args.subtitle,
        out_path=Path(args.output),
        dpi=args.dpi,
    )
    print(f"Chart generated: {args.output}")


if __name__ == "__main__":
    main()
