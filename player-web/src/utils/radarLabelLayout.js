const GROUP_LABEL_AVOID_STEP = 8;
const GROUP_LABEL_AVOID_MAX = 120;
const LABEL_COLLISION_GAP = 6;

function measureTextWidth(text, fontSize, fontFamily) {
  const fallback = String(text || "").length * fontSize * 0.6;
  if (typeof document === "undefined") return fallback;

  const canvas = measureTextWidth.canvas || (measureTextWidth.canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback;
  ctx.font = `${fontSize}px ${fontFamily}`;
  return ctx.measureText(String(text || "")).width || fallback;
}

function buildCenteredTextBox(text, x, y, fontSize, fontFamily) {
  const width = measureTextWidth(text, fontSize, fontFamily);
  const padX = 4;
  const padY = 2;
  return {
    left: x - width / 2 - padX,
    right: x + width / 2 + padX,
    top: y - fontSize - padY,
    bottom: y + fontSize * 0.3 + padY
  };
}

function boxesOverlap(a, b, gap = 0) {
  return !(a.right + gap < b.left || a.left > b.right + gap || a.bottom + gap < b.top || a.top > b.bottom + gap);
}

export function computeGroupLabelLayouts({
  sortedRows,
  stats,
  textStyle,
  chartStyle,
  centerX,
  centerY,
  innerRing,
  maxRadialLength,
  metricLabelRadius
}) {
  const metricBoxes = sortedRows.map((row, i) => {
    const angle = stats.startAngle + i * stats.step;
    const x = centerX + metricLabelRadius * Math.cos(angle);
    const y = centerY + metricLabelRadius * Math.sin(angle);
    return buildCenteredTextBox(row.metric, x, y, textStyle.metricSize, textStyle.fontFamily);
  });

  const placedGroupBoxes = [];
  const maxAttempts = Math.ceil(GROUP_LABEL_AVOID_MAX / GROUP_LABEL_AVOID_STEP);

  return stats.groupStarts.map((groupStart, idx) => {
    const next = stats.groupStarts[idx + 1]?.index ?? sortedRows.length;
    const boundaryAngle = stats.startAngle + groupStart.index * stats.step - stats.step / 2;
    const lineLengthAdjust = Number(chartStyle.groupSeparatorLength || 0);
    const lineOffset = Number(chartStyle.groupSeparatorOffset || 0);
    const lineInnerRadius = innerRing - 16 - lineLengthAdjust / 2 + lineOffset;
    const lineOuterRadius = innerRing + maxRadialLength + 20 + lineLengthAdjust / 2 + lineOffset;
    const x1 = centerX + lineInnerRadius * Math.cos(boundaryAngle);
    const y1 = centerY + lineInnerRadius * Math.sin(boundaryAngle);
    const x2 = centerX + lineOuterRadius * Math.cos(boundaryAngle);
    const y2 = centerY + lineOuterRadius * Math.sin(boundaryAngle);
    const midIndex = (groupStart.index + next - 1) / 2;
    const midAngle = stats.startAngle + midIndex * stats.step;

    let resolvedRadius = chartStyle.groupLabelRadius;
    let gx = centerX + resolvedRadius * Math.cos(midAngle) + chartStyle.groupLabelOffsetX;
    let gy = centerY + resolvedRadius * Math.sin(midAngle) + chartStyle.groupLabelOffsetY;
    let groupBox = buildCenteredTextBox(groupStart.group, gx, gy, textStyle.groupSize, textStyle.fontFamily);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const hitMetric = metricBoxes.some((box) => boxesOverlap(groupBox, box, LABEL_COLLISION_GAP));
      const hitGroup = placedGroupBoxes.some((box) => boxesOverlap(groupBox, box, LABEL_COLLISION_GAP));
      if (!hitMetric && !hitGroup) break;

      resolvedRadius += GROUP_LABEL_AVOID_STEP;
      gx = centerX + resolvedRadius * Math.cos(midAngle) + chartStyle.groupLabelOffsetX;
      gy = centerY + resolvedRadius * Math.sin(midAngle) + chartStyle.groupLabelOffsetY;
      groupBox = buildCenteredTextBox(groupStart.group, gx, gy, textStyle.groupSize, textStyle.fontFamily);
    }

    placedGroupBoxes.push(groupBox);
    return {
      key: `${groupStart.group}-${idx}`,
      group: groupStart.group,
      x1,
      y1,
      x2,
      y2,
      gx,
      gy
    };
  });
}
