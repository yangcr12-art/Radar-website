#!/usr/bin/env python3
"""Generate grouped radial player chart as SVG without third-party deps."""

from __future__ import annotations

import argparse
import csv
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


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


def parse_rows(csv_path: Path) -> list[MetricRow]:
    rows: list[MetricRow] = []
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {"metric", "value", "group", "order"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing required columns: {sorted(missing)}")

        for idx, row in enumerate(reader, start=2):
            metric = (row.get("metric") or "").strip()
            group = (row.get("group") or "").strip()
            per90 = (row.get("per90") or "").strip()
            tier = (row.get("tier") or "avg").strip().lower()
            color = (row.get("color") or "").strip() or None

            try:
                value = float((row.get("value") or "").strip())
                order = int((row.get("order") or "").strip())
            except ValueError as exc:
                raise ValueError(f"Invalid numeric field at line {idx}: {exc}") from exc

            if not metric:
                raise ValueError(f"Empty metric at line {idx}")
            if not group:
                raise ValueError(f"Empty group at line {idx}")
            if not (0 <= value <= 100):
                raise ValueError(f"value out of range 0..100 at line {idx}")

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
    rows.sort(key=lambda x: (x.order, x.group, x.metric))
    return rows


def rgba(hex_color: str, alpha: float) -> str:
    c = hex_color.lstrip("#")
    if len(c) != 6:
        return hex_color
    r = int(c[0:2], 16)
    g = int(c[2:4], 16)
    b = int(c[4:6], 16)
    return f"rgba({r},{g},{b},{alpha:.3f})"


def polar_to_xy(cx: float, cy: float, r: float, angle: float) -> tuple[float, float]:
    return cx + r * math.cos(angle), cy + r * math.sin(angle)


def ring_wedge_points(
    cx: float,
    cy: float,
    r0: float,
    r1: float,
    a0: float,
    a1: float,
) -> str:
    p1 = polar_to_xy(cx, cy, r0, a0)
    p2 = polar_to_xy(cx, cy, r1, a0)
    p3 = polar_to_xy(cx, cy, r1, a1)
    p4 = polar_to_xy(cx, cy, r0, a1)
    return " ".join(f"{x:.2f},{y:.2f}" for x, y in [p1, p2, p3, p4])


def text_anchor(angle: float) -> str:
    deg = math.degrees(angle) % 360
    if 80 <= deg <= 280:
        return "end"
    return "start"


def draw_svg(rows: list[MetricRow], title: str, subtitle: str, out_path: Path) -> None:
    if not rows:
        raise ValueError("No rows in CSV")

    width = 1300
    height = 1300
    cx = width / 2
    cy = height / 2
    inner = 170.0
    radial_max = 360.0

    n = len(rows)
    step = (2 * math.pi) / n
    bar_width = step * 0.82
    start = -math.pi / 2

    lines: list[str] = []
    lines.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" style="background:#f8f5ef">'
    )
    lines.append('<g font-family="Arial, Helvetica, sans-serif">')

    # grid rings
    for pct in [20, 40, 60, 80, 100]:
        r = inner + (pct / 100.0) * radial_max
        lines.append(
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="none" '
            f'stroke="#d0cdc6" stroke-width="1" stroke-dasharray="4 8"/>'
        )

    lines.append(
        f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{inner:.2f}" fill="#f8f5ef" stroke="#a89f94" stroke-width="2"/>'
    )

    # bars and labels
    prev_group = None
    group_starts: list[tuple[int, str]] = []
    for i, row in enumerate(rows):
        if row.group != prev_group:
            group_starts.append((i, row.group))
            prev_group = row.group

        angle = start + i * step
        a0 = angle - bar_width / 2
        a1 = angle + bar_width / 2
        r1 = inner + (row.value / 100.0) * radial_max
        color = row.color if row.color else DEFAULT_TIER_COLORS.get(row.tier, DEFAULT_TIER_COLORS["avg"])

        points = ring_wedge_points(cx, cy, inner, r1, a0, a1)
        lines.append(
            f'<polygon points="{points}" fill="{rgba(color, 0.23)}" stroke="{color}" stroke-width="2"/>'
        )

        # metric label
        lr = r1 + 34
        lx, ly = polar_to_xy(cx, cy, lr, angle)
        deg = math.degrees(angle)
        anchor = text_anchor(deg)
        rotation = deg + 90
        if anchor == "end":
            rotation += 180
        lines.append(
            f'<text x="{lx:.2f}" y="{ly:.2f}" fill="{color}" font-size="18" text-anchor="{anchor}" '
            f'transform="rotate({rotation:.2f},{lx:.2f},{ly:.2f})">{row.metric}</text>'
        )

        # per90 label box
        if row.per90:
            tx, ty = polar_to_xy(cx, cy, inner + (r1 - inner) * 0.85, angle)
            bw = max(44, len(row.per90) * 10 + 16)
            bh = 28
            lines.append(
                f'<rect x="{tx - bw/2:.2f}" y="{ty - bh/2:.2f}" width="{bw:.2f}" height="{bh:.2f}" '
                f'rx="5" ry="5" fill="{color}" stroke="#262626" stroke-width="1.2"/>'
            )
            lines.append(
                f'<text x="{tx:.2f}" y="{ty + 6:.2f}" fill="#ffffff" font-size="15" text-anchor="middle">{row.per90}</text>'
            )

    # group boundaries and titles
    group_ends = [idx for idx, _ in group_starts[1:]] + [n]
    for (idx, name), end_idx in zip(group_starts, group_ends):
        boundary_angle = start + idx * step - step / 2
        x1, y1 = polar_to_xy(cx, cy, inner - 20, boundary_angle)
        x2, y2 = polar_to_xy(cx, cy, inner + radial_max + 40, boundary_angle)
        lines.append(
            f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="#c1bbb2" stroke-width="1.5"/>'
        )

        mid = (idx + end_idx - 1) / 2
        mid_angle = start + int(mid) * step
        gx, gy = polar_to_xy(cx, cy, inner + radial_max + 72, mid_angle)
        lines.append(
            f'<text x="{gx:.2f}" y="{gy:.2f}" fill="#6f675d" font-size="20" text-anchor="middle" font-weight="700">{name}</text>'
        )

    # title
    lines.append(
        f'<text x="{cx:.2f}" y="56" fill="#2f2a24" font-size="38" text-anchor="middle" font-weight="700">{title}</text>'
    )
    if subtitle:
        lines.append(
            f'<text x="{cx:.2f}" y="92" fill="#5f5850" font-size="24" text-anchor="middle">{subtitle}</text>'
        )

    # legend
    legend = [
        ("Elite (Top 10%)", DEFAULT_TIER_COLORS["elite"]),
        ("Above Average (11-35%)", DEFAULT_TIER_COLORS["above_avg"]),
        ("Average (36-66%)", DEFAULT_TIER_COLORS["avg"]),
        ("Bottom (Bottom 35%)", DEFAULT_TIER_COLORS["bottom"]),
    ]
    ly = 1160
    for text, color in legend:
        lines.append(
            f'<text x="920" y="{ly}" fill="{color}" font-size="20" text-anchor="start">{text}</text>'
        )
        ly += 30

    lines.append("</g></svg>")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate grouped radial chart as SVG.")
    parser.add_argument("--input", required=True, help="Input CSV")
    parser.add_argument("--output", required=True, help="Output SVG path")
    parser.add_argument("--title", required=True, help="Main title")
    parser.add_argument("--subtitle", default="", help="Subtitle")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows = parse_rows(Path(args.input))
    draw_svg(rows=rows, title=args.title, subtitle=args.subtitle, out_path=Path(args.output))
    print(f"Chart generated: {args.output}")


if __name__ == "__main__":
    main()
