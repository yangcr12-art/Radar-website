import React, { useEffect, useMemo, useState } from "react";
import { getTeamMappingRowsByEnglish, normalizeTeamName } from "../../utils/teamMappingStore";
import { getNameMappingRowsByEnglish, normalizePlayerName } from "../../utils/nameMappingStore";

const CHART_WIDTH = 1160;
const CHART_HEIGHT = 680;
const MARGIN = { top: 24, right: 24, bottom: 52, left: 64 };
const SHAPE_SET = new Set(["circle", "square", "triangle", "diamond", "cross"]);
const POINT_SIZE_MIN = 2;
const POINT_SIZE_MAX = 14;
const POINT_SIZE_DEFAULT = 5.2;
const POINT_STROKE_WIDTH_MIN = 0;
const POINT_STROKE_WIDTH_MAX = 6;
const POINT_STROKE_WIDTH_DEFAULT = 1.2;

function pickTeamColumn(columns) {
  const list = Array.isArray(columns) ? columns : [];
  const exact = list.find((name) => String(name).toLowerCase() === "team");
  if (exact) return exact;
  const byKeyword = list.find((name) => ["team", "club", "squad"].some((kw) => String(name).toLowerCase().includes(kw)));
  return byKeyword || "";
}

function normalizeShape(shape) {
  const value = String(shape || "").trim().toLowerCase();
  return SHAPE_SET.has(value) ? value : "circle";
}

function getPointTeamStyle(point, teamColumn, mappingByEnglish) {
  if (!teamColumn) {
    return { fill: "", shape: "circle", teamName: "" };
  }
  const teamName = normalizeTeamName(point?.raw?.[teamColumn]);
  const key = teamName.toLowerCase();
  const mapped = key ? mappingByEnglish.get(key) : null;
  const fill = String(mapped?.color || "").trim() || "#000000";
  const shape = normalizeShape(mapped?.shape);
  return { fill, shape, teamName };
}

function renderPointShape(shape, cx, cy, size, fill, stroke, strokeWidth) {
  if (shape === "square") {
    return <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} rx="0.8" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  if (shape === "triangle") {
    return (
      <polygon
        points={`${cx},${cy - size} ${cx - size * 0.95},${cy + size * 0.9} ${cx + size * 0.95},${cy + size * 0.9}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  if (shape === "diamond") {
    return (
      <polygon
        points={`${cx},${cy - size} ${cx - size},${cy} ${cx},${cy + size} ${cx + size},${cy}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  if (shape === "cross") {
    return (
      <g>
        <line x1={cx - size} y1={cy - size} x2={cx + size} y2={cy + size} stroke={fill} strokeWidth={Math.max(1.8, strokeWidth + 0.4)} strokeLinecap="round" />
        <line x1={cx - size} y1={cy + size} x2={cx + size} y2={cy - size} stroke={fill} strokeWidth={Math.max(1.8, strokeWidth + 0.4)} strokeLinecap="round" />
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={size} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function scaleLinear(value, domainMin, domainMax, rangeMin, rangeMax) {
  if (domainMax === domainMin) {
    return (rangeMin + rangeMax) / 2;
  }
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getSliderStep(min, max) {
  const span = Math.abs(max - min);
  if (span <= 2) return 0.01;
  if (span <= 20) return 0.1;
  if (span <= 200) return 1;
  return 5;
}

function toCompactNumberText(value) {
  return String(Number(value.toFixed(2)));
}

function buildTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, idx) => min + step * idx);
}

function formatTickValue(value) {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1000) return String(Math.round(value));
  if (abs >= 100) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function ScatterPlotPage(props) {
  const {
    datasetOptions,
    selectedDatasetId,
    setSelectedDatasetId,
    onDeleteCurrentDataset,
    scatterLoading,
    scatterError,
    scatterDoc,
    scatterConfig,
    onScatterConfigChange,
    formatPlayerDataColumnLabel
  } = props;

  const [hoverInfo, setHoverInfo] = useState(null);
  const [datasetPanelOpen, setDatasetPanelOpen] = useState(true);
  const [coordPanelOpen, setCoordPanelOpen] = useState(true);
  const [playerPanelOpen, setPlayerPanelOpen] = useState(true);
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [displayPanelOpen, setDisplayPanelOpen] = useState(false);

  const players = Array.isArray(scatterDoc?.players) ? scatterDoc.players : [];
  const numericColumns = Array.isArray(scatterDoc?.schema?.numericColumns) ? scatterDoc.schema.numericColumns : [];
  const allColumns = Array.isArray(scatterDoc?.schema?.allColumns) ? scatterDoc.schema.allColumns : [];
  const xCol = String(scatterConfig?.xCol || "");
  const yCol = String(scatterConfig?.yCol || "");
  const xAxisLabelCustom = String(scatterConfig?.xAxisLabel || "");
  const yAxisLabelCustom = String(scatterConfig?.yAxisLabel || "");
  const axisLabelFontSizeRaw = Number(scatterConfig?.axisLabelFontSize);
  const axisLabelFontSize = Number.isFinite(axisLabelFontSizeRaw) ? Math.max(10, Math.min(32, axisLabelFontSizeRaw)) : 13;
  const axisLabelFontWeight = String(scatterConfig?.axisLabelFontWeight || "500");
  const axisLabelColor = String(scatterConfig?.axisLabelColor || "#4f453b");
  const avgLineColor = String(scatterConfig?.avgLineColor || "#d97706");
  const avgLineWidthRaw = Number(scatterConfig?.avgLineWidth);
  const avgLineWidth = Number.isFinite(avgLineWidthRaw) ? Math.max(0.5, Math.min(6, avgLineWidthRaw)) : 1.6;
  const showAverageLines = scatterConfig?.showAverageLines !== false;
  const showPointPlayerNames = Boolean(scatterConfig?.showPointPlayerNames);
  const pointSizeRaw = Number(scatterConfig?.pointSize);
  const pointSize = Number.isFinite(pointSizeRaw) ? clamp(pointSizeRaw, POINT_SIZE_MIN, POINT_SIZE_MAX) : POINT_SIZE_DEFAULT;
  const selectedPointSize = pointSize + 1.6;
  const pointStrokeColor = String(scatterConfig?.pointStrokeColor || "#ffffff");
  const pointStrokeWidthRaw = Number(scatterConfig?.pointStrokeWidth);
  const pointStrokeWidth = Number.isFinite(pointStrokeWidthRaw)
    ? clamp(pointStrokeWidthRaw, POINT_STROKE_WIDTH_MIN, POINT_STROKE_WIDTH_MAX)
    : POINT_STROKE_WIDTH_DEFAULT;
  const selectedPointStrokeWidth = Math.min(POINT_STROKE_WIDTH_MAX, pointStrokeWidth + 0.6);
  const searchQuery = String(scatterConfig?.searchQuery || "").trim().toLowerCase();
  const xMin = toFiniteNumber(scatterConfig?.xMin);
  const xMax = toFiniteNumber(scatterConfig?.xMax);
  const yMin = toFiniteNumber(scatterConfig?.yMin);
  const yMax = toFiniteNumber(scatterConfig?.yMax);
  const teamMappingByEnglish = useMemo(() => getTeamMappingRowsByEnglish(), [selectedDatasetId]);
  const nameMappingByEnglish = useMemo(() => getNameMappingRowsByEnglish(), []);
  const teamColumn = useMemo(() => {
    const fromSchema = pickTeamColumn(allColumns);
    if (fromSchema) return fromSchema;
    const fallbackColumns = players.length > 0 && players[0]?.raw && typeof players[0].raw === "object" ? Object.keys(players[0].raw) : [];
    return pickTeamColumn(fallbackColumns);
  }, [allColumns, players]);

  const allAxisPoints = useMemo(() => {
    if (!xCol || !yCol) return [];
    return players
      .map((player) => {
        const raw = player?.raw || {};
        const x = toFiniteNumber(raw[xCol]);
        const y = toFiniteNumber(raw[yCol]);
        if (x === null || y === null) return null;
        const playerEn = String(player?.player || "");
        const playerZh = String(nameMappingByEnglish.get(normalizePlayerName(playerEn).toLowerCase())?.zh || "").trim();
        const playerDisplay = playerZh || playerEn;
        return {
          id: String(player?.id || ""),
          player: playerDisplay,
          playerEn,
          playerZh,
          playerDisplay,
          x,
          y,
          raw,
          metrics: player?.metrics || {}
        };
      })
      .filter(Boolean);
  }, [players, xCol, yCol, nameMappingByEnglish]);

  const basePoints = useMemo(() => {
    if (!searchQuery) return allAxisPoints;
    return allAxisPoints.filter((point) => {
      const en = String(point.playerEn || "").toLowerCase();
      const zh = String(point.playerZh || "").toLowerCase();
      const display = String(point.playerDisplay || "").toLowerCase();
      return en.includes(searchQuery) || zh.includes(searchQuery) || display.includes(searchQuery);
    });
  }, [allAxisPoints, searchQuery]);

  const axisBounds = useMemo(() => {
    if (allAxisPoints.length === 0) return null;
    let xMinVal = Math.min(...allAxisPoints.map((p) => p.x));
    let xMaxVal = Math.max(...allAxisPoints.map((p) => p.x));
    let yMinVal = Math.min(...allAxisPoints.map((p) => p.y));
    let yMaxVal = Math.max(...allAxisPoints.map((p) => p.y));
    if (xMinVal === xMaxVal) {
      xMinVal -= 1;
      xMaxVal += 1;
    }
    if (yMinVal === yMaxVal) {
      yMinVal -= 1;
      yMaxVal += 1;
    }
    return {
      xMin: xMinVal,
      xMax: xMaxVal,
      yMin: yMinVal,
      yMax: yMaxVal,
      xStep: getSliderStep(xMinVal, xMaxVal),
      yStep: getSliderStep(yMinVal, yMaxVal)
    };
  }, [allAxisPoints]);

  const rangeFilter = useMemo(() => {
    if (!axisBounds) return null;
    let nextXMin = xMin === null ? axisBounds.xMin : clamp(xMin, axisBounds.xMin, axisBounds.xMax);
    let nextXMax = xMax === null ? axisBounds.xMax : clamp(xMax, axisBounds.xMin, axisBounds.xMax);
    let nextYMin = yMin === null ? axisBounds.yMin : clamp(yMin, axisBounds.yMin, axisBounds.yMax);
    let nextYMax = yMax === null ? axisBounds.yMax : clamp(yMax, axisBounds.yMin, axisBounds.yMax);
    if (nextXMin > nextXMax) [nextXMin, nextXMax] = [nextXMax, nextXMin];
    if (nextYMin > nextYMax) [nextYMin, nextYMax] = [nextYMax, nextYMin];
    return { xMin: nextXMin, xMax: nextXMax, yMin: nextYMin, yMax: nextYMax };
  }, [axisBounds, xMin, xMax, yMin, yMax]);

  const points = useMemo(() => {
    if (!rangeFilter) return basePoints;
    return basePoints.filter(
      (point) =>
        point.x >= rangeFilter.xMin &&
        point.x <= rangeFilter.xMax &&
        point.y >= rangeFilter.yMin &&
        point.y <= rangeFilter.yMax
    );
  }, [basePoints, rangeFilter]);

  const playerOptions = points;

  const onRangeNumberChange = (field, value) => {
    onScatterConfigChange({ [field]: value });
  };

  const onRangeSliderChange = (field, value) => {
    if (!rangeFilter || !axisBounds) return;
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    if (field === "xMin") {
      onScatterConfigChange({ xMin: toCompactNumberText(Math.min(num, rangeFilter.xMax)) });
      return;
    }
    if (field === "xMax") {
      onScatterConfigChange({ xMax: toCompactNumberText(Math.max(num, rangeFilter.xMin)) });
      return;
    }
    if (field === "yMin") {
      onScatterConfigChange({ yMin: toCompactNumberText(Math.min(num, rangeFilter.yMax)) });
      return;
    }
    onScatterConfigChange({ yMax: toCompactNumberText(Math.max(num, rangeFilter.yMin)) });
  };

  const chart = useMemo(() => {
    if (points.length === 0) return null;
    let xMinVal = Math.min(...points.map((p) => p.x));
    let xMaxVal = Math.max(...points.map((p) => p.x));
    let yMinVal = Math.min(...points.map((p) => p.y));
    let yMaxVal = Math.max(...points.map((p) => p.y));

    if (xMinVal === xMaxVal) {
      xMinVal -= 1;
      xMaxVal += 1;
    }
    if (yMinVal === yMaxVal) {
      yMinVal -= 1;
      yMaxVal += 1;
    }

    const xSpan = xMaxVal - xMinVal;
    const ySpan = yMaxVal - yMinVal;
    const xPad = xSpan * 0.08;
    const yPad = ySpan * 0.08;

    const domain = {
      xMin: xMinVal - xPad,
      xMax: xMaxVal + xPad,
      yMin: yMinVal - yPad,
      yMax: yMaxVal + yPad
    };

    const innerWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
    const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

    const scaledPoints = points.map((point) => ({
      ...point,
      cx: scaleLinear(point.x, domain.xMin, domain.xMax, MARGIN.left, MARGIN.left + innerWidth),
      cy: scaleLinear(point.y, domain.yMin, domain.yMax, MARGIN.top + innerHeight, MARGIN.top)
    }));

    const xTicks = buildTicks(domain.xMin, domain.xMax, 6);
    const yTicks = buildTicks(domain.yMin, domain.yMax, 6);

    return { domain, innerWidth, innerHeight, scaledPoints, xTicks, yTicks };
  }, [points]);

  const averagePoint = useMemo(() => {
    if (!allAxisPoints.length) return null;
    const totalX = allAxisPoints.reduce((sum, point) => sum + point.x, 0);
    const totalY = allAxisPoints.reduce((sum, point) => sum + point.y, 0);
    return {
      x: totalX / allAxisPoints.length,
      y: totalY / allAxisPoints.length
    };
  }, [allAxisPoints]);

  const averageScreenPoint = useMemo(() => {
    if (!averagePoint || !chart) return null;
    return {
      x: scaleLinear(averagePoint.x, chart.domain.xMin, chart.domain.xMax, MARGIN.left, CHART_WIDTH - MARGIN.right),
      y: scaleLinear(averagePoint.y, chart.domain.yMin, chart.domain.yMax, CHART_HEIGHT - MARGIN.bottom, MARGIN.top)
    };
  }, [averagePoint, chart]);

  const selectedPoint = useMemo(() => {
    const selectedId = String(scatterConfig?.selectedPlayerId || "");
    if (!selectedId) return null;
    return points.find((point) => point.id === selectedId) || null;
  }, [points, scatterConfig?.selectedPlayerId]);

  const canDraw = Boolean(selectedDatasetId && xCol && yCol);
  const xAxisLabel = xAxisLabelCustom.trim() || formatPlayerDataColumnLabel(xCol);
  const yAxisLabel = yAxisLabelCustom.trim() || formatPlayerDataColumnLabel(yCol);

  useEffect(() => {
    const patch = {};
    if (xCol) {
      const nextXLabel = formatPlayerDataColumnLabel(xCol);
      if (xAxisLabel !== nextXLabel) {
        patch.xAxisLabel = nextXLabel;
      }
    } else if (xAxisLabelCustom) {
      patch.xAxisLabel = "";
    }
    if (yCol) {
      const nextYLabel = formatPlayerDataColumnLabel(yCol);
      if (yAxisLabel !== nextYLabel) {
        patch.yAxisLabel = nextYLabel;
      }
    } else if (yAxisLabelCustom) {
      patch.yAxisLabel = "";
    }
    if (Object.keys(patch).length > 0) {
      onScatterConfigChange(patch);
    }
  }, [xCol, yCol, xAxisLabel, yAxisLabel, xAxisLabelCustom, yAxisLabelCustom, formatPlayerDataColumnLabel, onScatterConfigChange]);

  return (
    <section className="info-page scatter-page">
      <div className="info-card scatter-card">
        <div className="scatter-left">
          <h1>散点图生成器</h1>
          <p>复用已导入球员数据集，手动选择 X/Y 轴后生成散点图。</p>
          <div className="scatter-section">
            <button type="button" className="section-toggle" onClick={() => setDatasetPanelOpen((prev) => !prev)}>
              <span>数据集控制</span>
              <span>{datasetPanelOpen ? "▾" : "▸"}</span>
            </button>
            {datasetPanelOpen ? (
              <div className="scatter-collapse-body">
                <div className="title-row">
                  <label>导入数据集</label>
                  <select value={selectedDatasetId} onChange={(e) => setSelectedDatasetId(e.target.value)} disabled={datasetOptions.length === 0}>
                    {datasetOptions.length === 0 ? <option value="">暂无已导入数据集</option> : null}
                    {datasetOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="scatter-inline-stat">
                  <span>有效点数</span>
                  <strong>{`${points.length}/${players.length}`}</strong>
                </div>
                <div className="btn-row">
                  <button className="danger" onClick={onDeleteCurrentDataset} disabled={!selectedDatasetId || scatterLoading}>
                    删除当前数据集
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="scatter-section">
            <button type="button" className="section-toggle" onClick={() => setCoordPanelOpen((prev) => !prev)}>
              <span>坐标控制</span>
              <span>{coordPanelOpen ? "▾" : "▸"}</span>
            </button>
            {coordPanelOpen ? (
              <div className="scatter-collapse-body">
                <div className="scatter-axis-grid">
                  <div className="title-row">
                    <label>X 轴</label>
                    <select
                      className="scatter-axis-select"
                      value={xCol}
                      onChange={(e) => onScatterConfigChange({ xCol: e.target.value })}
                      disabled={!selectedDatasetId || scatterLoading || numericColumns.length === 0}
                    >
                      <option value="">请选择 X 轴</option>
                      {numericColumns.map((column) => (
                        <option key={`x-${column}`} value={column}>
                          {formatPlayerDataColumnLabel(column)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="title-row">
                    <label>Y 轴</label>
                    <select
                      className="scatter-axis-select"
                      value={yCol}
                      onChange={(e) => onScatterConfigChange({ yCol: e.target.value })}
                      disabled={!selectedDatasetId || scatterLoading || numericColumns.length === 0}
                    >
                      <option value="">请选择 Y 轴</option>
                      {numericColumns.map((column) => (
                        <option key={`y-${column}`} value={column}>
                          {formatPlayerDataColumnLabel(column)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="scatter-axis-grid">
                  <div className="title-row">
                    <label>X 轴标题文本</label>
                    <input
                      value={xAxisLabel}
                      onChange={(e) => onScatterConfigChange({ xAxisLabel: e.target.value })}
                      placeholder={xCol ? formatPlayerDataColumnLabel(xCol) : "先选择 X 轴"}
                    />
                  </div>
                  <div className="title-row">
                    <label>Y 轴标题文本</label>
                    <input
                      value={yAxisLabel}
                      onChange={(e) => onScatterConfigChange({ yAxisLabel: e.target.value })}
                      placeholder={yCol ? formatPlayerDataColumnLabel(yCol) : "先选择 Y 轴"}
                    />
                  </div>
                </div>
                <div className="scatter-filter-grid">
                  <div className="title-row">
                    <label>X 最小值</label>
                    <div className="scatter-range-control">
                      <input
                        type="number"
                        step={axisBounds?.xStep || 0.1}
                        value={scatterConfig.xMin || ""}
                        onChange={(e) => onRangeNumberChange("xMin", e.target.value)}
                        placeholder="可选"
                      />
                      <input
                        type="range"
                        min={axisBounds?.xMin || 0}
                        max={axisBounds?.xMax || 100}
                        step={axisBounds?.xStep || 0.1}
                        value={rangeFilter?.xMin ?? 0}
                        disabled={!axisBounds}
                        onChange={(e) => onRangeSliderChange("xMin", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="title-row">
                    <label>X 最大值</label>
                    <div className="scatter-range-control">
                      <input
                        type="number"
                        step={axisBounds?.xStep || 0.1}
                        value={scatterConfig.xMax || ""}
                        onChange={(e) => onRangeNumberChange("xMax", e.target.value)}
                        placeholder="可选"
                      />
                      <input
                        type="range"
                        min={axisBounds?.xMin || 0}
                        max={axisBounds?.xMax || 100}
                        step={axisBounds?.xStep || 0.1}
                        value={rangeFilter?.xMax ?? 0}
                        disabled={!axisBounds}
                        onChange={(e) => onRangeSliderChange("xMax", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="title-row">
                    <label>Y 最小值</label>
                    <div className="scatter-range-control">
                      <input
                        type="number"
                        step={axisBounds?.yStep || 0.1}
                        value={scatterConfig.yMin || ""}
                        onChange={(e) => onRangeNumberChange("yMin", e.target.value)}
                        placeholder="可选"
                      />
                      <input
                        type="range"
                        min={axisBounds?.yMin || 0}
                        max={axisBounds?.yMax || 100}
                        step={axisBounds?.yStep || 0.1}
                        value={rangeFilter?.yMin ?? 0}
                        disabled={!axisBounds}
                        onChange={(e) => onRangeSliderChange("yMin", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="title-row">
                    <label>Y 最大值</label>
                    <div className="scatter-range-control">
                      <input
                        type="number"
                        step={axisBounds?.yStep || 0.1}
                        value={scatterConfig.yMax || ""}
                        onChange={(e) => onRangeNumberChange("yMax", e.target.value)}
                        placeholder="可选"
                      />
                      <input
                        type="range"
                        min={axisBounds?.yMin || 0}
                        max={axisBounds?.yMax || 100}
                        step={axisBounds?.yStep || 0.1}
                        value={rangeFilter?.yMax ?? 0}
                        disabled={!axisBounds}
                        onChange={(e) => onRangeSliderChange("yMax", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="scatter-section">
            <button type="button" className="section-toggle" onClick={() => setPlayerPanelOpen((prev) => !prev)}>
              <span>球员筛选</span>
              <span>{playerPanelOpen ? "▾" : "▸"}</span>
            </button>
            {playerPanelOpen ? (
              <div className="scatter-collapse-body">
                <div className="scatter-axis-grid">
                  <div className="title-row">
                    <label>搜索球员</label>
                    <input
                      placeholder="按球员名筛选"
                      value={scatterConfig.searchQuery || ""}
                      onChange={(e) => onScatterConfigChange({ searchQuery: e.target.value })}
                      disabled={!selectedDatasetId || scatterLoading}
                    />
                  </div>
                  <div className="title-row">
                    <label>选择球员</label>
                    <select
                      value={scatterConfig.selectedPlayerId || ""}
                      onChange={(e) =>
                        onScatterConfigChange({
                          selectedPlayerId: e.target.value,
                          searchQuery: ""
                        })
                      }
                      disabled={!selectedDatasetId || scatterLoading || playerOptions.length === 0}
                    >
                      <option value="">{playerOptions.length === 0 ? "暂无可选球员" : "请选择球员（可选）"}</option>
                      {playerOptions.map((point) => (
                        <option key={`player-${point.id}`} value={point.id}>
                          {point.playerDisplay}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="btn-row">
                  <button
                    onClick={() =>
                      onScatterConfigChange({
                        searchQuery: "",
                        xMin: "",
                        xMax: "",
                        yMin: "",
                        yMax: "",
                        selectedPlayerId: ""
                      })
                    }
                    disabled={!selectedDatasetId}
                  >
                    清空筛选
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="scatter-section">
            <button type="button" className="section-toggle" onClick={() => setStylePanelOpen((prev) => !prev)}>
              <span>样式</span>
              <span>{stylePanelOpen ? "▾" : "▸"}</span>
            </button>
            {stylePanelOpen ? (
              <div className="scatter-collapse-body">
                <div className="scatter-style-grid">
                  <div className="title-row">
                    <label>坐标字号</label>
                    <input
                      type="number"
                      min="10"
                      max="32"
                      step="1"
                      value={axisLabelFontSize}
                      onChange={(e) => onScatterConfigChange({ axisLabelFontSize: Number(e.target.value) })}
                    />
                  </div>
                  <div className="title-row">
                    <label>坐标粗细</label>
                    <select
                      value={axisLabelFontWeight}
                      onChange={(e) => onScatterConfigChange({ axisLabelFontWeight: e.target.value })}
                    >
                      <option value="400">常规</option>
                      <option value="500">中等</option>
                      <option value="600">半粗</option>
                      <option value="700">加粗</option>
                    </select>
                  </div>
                  <div className="title-row">
                    <label>坐标颜色</label>
                    <input
                      type="color"
                      value={axisLabelColor}
                      onChange={(e) => onScatterConfigChange({ axisLabelColor: e.target.value })}
                    />
                  </div>
                  <div className="title-row">
                    <label>平均线开关</label>
                    <label className="scatter-checkbox-row">
                      <input
                        type="checkbox"
                        checked={showAverageLines}
                        onChange={(e) => onScatterConfigChange({ showAverageLines: e.target.checked })}
                      />
                      <span>显示平均线</span>
                    </label>
                  </div>
                  <div className="title-row">
                    <label>平均线粗细</label>
                    <input
                      type="number"
                      min="0.5"
                      max="6"
                      step="0.1"
                      value={avgLineWidth}
                      onChange={(e) => onScatterConfigChange({ avgLineWidth: Number(e.target.value) })}
                    />
                  </div>
                  <div className="title-row">
                    <label>平均线颜色</label>
                    <input
                      type="color"
                      value={avgLineColor}
                      onChange={(e) => onScatterConfigChange({ avgLineColor: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="scatter-section">
            <button type="button" className="section-toggle" onClick={() => setDisplayPanelOpen((prev) => !prev)}>
              <span>显示控制</span>
              <span>{displayPanelOpen ? "▾" : "▸"}</span>
            </button>
            {displayPanelOpen ? (
              <div className="scatter-collapse-body">
                <label className="scatter-checkbox-row">
                  <input
                    type="checkbox"
                    checked={showPointPlayerNames}
                    onChange={(e) => onScatterConfigChange({ showPointPlayerNames: e.target.checked })}
                  />
                  <span>显示球员名字</span>
                </label>
                <div className="scatter-inline-row scatter-inline-size-row">
                  <label>点大小</label>
                  <input
                    className="scatter-inline-number"
                    type="number"
                    min={POINT_SIZE_MIN}
                    max={POINT_SIZE_MAX}
                    step="0.1"
                    value={pointSize}
                    onChange={(e) => onScatterConfigChange({ pointSize: Number(e.target.value) })}
                  />
                  <input
                    className="scatter-inline-slider"
                    type="range"
                    min={POINT_SIZE_MIN}
                    max={POINT_SIZE_MAX}
                    step="0.1"
                    value={pointSize}
                    onChange={(e) => onScatterConfigChange({ pointSize: Number(e.target.value) })}
                  />
                </div>
                <div className="scatter-inline-row scatter-inline-border-row">
                  <label>点边框颜色</label>
                  <input
                    className="scatter-inline-color"
                    type="color"
                    value={pointStrokeColor}
                    onChange={(e) => onScatterConfigChange({ pointStrokeColor: e.target.value })}
                  />
                  <label>边框粗细</label>
                  <input
                    className="scatter-inline-number"
                    type="number"
                    min={POINT_STROKE_WIDTH_MIN}
                    max={POINT_STROKE_WIDTH_MAX}
                    step="0.1"
                    value={pointStrokeWidth}
                    onChange={(e) => onScatterConfigChange({ pointStrokeWidth: Number(e.target.value) })}
                  />
                  <input
                    className="scatter-inline-slider"
                    type="range"
                    min={POINT_STROKE_WIDTH_MIN}
                    max={POINT_STROKE_WIDTH_MAX}
                    step="0.1"
                    value={pointStrokeWidth}
                    onChange={(e) => onScatterConfigChange({ pointStrokeWidth: Number(e.target.value) })}
                  />
                </div>
              </div>
            ) : null}
          </div>
          {scatterError ? <p className="msg err">{scatterError}</p> : null}
        </div>

        <div className="scatter-right">
          <div className="scatter-chart-panel">
            {!selectedDatasetId ? <p>请先选择或导入数据集。</p> : null}
            {selectedDatasetId && numericColumns.length < 2 ? <p>当前数据集数值列不足 2 个，无法绘制散点图。</p> : null}
            {selectedDatasetId && canDraw && !teamColumn ? <p className="msg">当前数据集未识别到球队列（Team / Club / Squad），点样式保持默认。</p> : null}
            {selectedDatasetId && canDraw && points.length === 0 ? <p>当前筛选条件下无有效散点，请调整筛选。</p> : null}
            {selectedDatasetId && !canDraw ? <p>请先手动选择 X 轴和 Y 轴。</p> : null}
            {selectedDatasetId && scatterLoading ? <p>数据加载中...</p> : null}

            {selectedDatasetId && canDraw && chart && points.length > 0 ? (
              <div className="scatter-chart-wrap">
                <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="scatter-svg">
                  <rect x="0" y="0" width={CHART_WIDTH} height={CHART_HEIGHT} fill="#f8f5ef" />
                  <line
                    x1={MARGIN.left}
                    y1={CHART_HEIGHT - MARGIN.bottom}
                    x2={CHART_WIDTH - MARGIN.right}
                    y2={CHART_HEIGHT - MARGIN.bottom}
                    stroke="#a89f94"
                    strokeWidth="1.2"
                  />
                  <line
                    x1={MARGIN.left}
                    y1={MARGIN.top}
                    x2={MARGIN.left}
                    y2={CHART_HEIGHT - MARGIN.bottom}
                    stroke="#a89f94"
                    strokeWidth="1.2"
                  />

                  {showAverageLines && averageScreenPoint ? (
                    <g>
                      <line
                        x1={averageScreenPoint.x}
                        y1={MARGIN.top}
                        x2={averageScreenPoint.x}
                        y2={CHART_HEIGHT - MARGIN.bottom}
                        stroke={avgLineColor}
                        strokeWidth={avgLineWidth}
                        strokeDasharray="6 6"
                      />
                      <line
                        x1={MARGIN.left}
                        y1={averageScreenPoint.y}
                        x2={CHART_WIDTH - MARGIN.right}
                        y2={averageScreenPoint.y}
                        stroke={avgLineColor}
                        strokeWidth={avgLineWidth}
                        strokeDasharray="6 6"
                      />
                    </g>
                  ) : null}

                  {chart.xTicks.map((tick, idx) => {
                    const tx = scaleLinear(tick, chart.domain.xMin, chart.domain.xMax, MARGIN.left, CHART_WIDTH - MARGIN.right);
                    return (
                      <g key={`xt-${idx}`}>
                        <line x1={tx} y1={CHART_HEIGHT - MARGIN.bottom} x2={tx} y2={CHART_HEIGHT - MARGIN.bottom + 6} stroke="#8f8578" strokeWidth="1" />
                        <text x={tx} y={CHART_HEIGHT - MARGIN.bottom + 20} textAnchor="middle" fill="#6b6257" fontSize="11">
                          {formatTickValue(tick)}
                        </text>
                      </g>
                    );
                  })}

                  {chart.yTicks.map((tick, idx) => {
                    const ty = scaleLinear(tick, chart.domain.yMin, chart.domain.yMax, CHART_HEIGHT - MARGIN.bottom, MARGIN.top);
                    return (
                      <g key={`yt-${idx}`}>
                        <line x1={MARGIN.left - 6} y1={ty} x2={MARGIN.left} y2={ty} stroke="#8f8578" strokeWidth="1" />
                        <text x={MARGIN.left - 10} y={ty + 4} textAnchor="end" fill="#6b6257" fontSize="11">
                          {formatTickValue(tick)}
                        </text>
                      </g>
                    );
                  })}

                  <text
                    x={(CHART_WIDTH - MARGIN.right + MARGIN.left) / 2}
                    y={CHART_HEIGHT - 12}
                    textAnchor="middle"
                    fill={axisLabelColor}
                    fontSize={axisLabelFontSize}
                    fontWeight={axisLabelFontWeight}
                  >
                    {xAxisLabel}
                  </text>
                  <text
                    x={16}
                    y={CHART_HEIGHT / 2}
                    transform={`rotate(-90 16 ${CHART_HEIGHT / 2})`}
                    textAnchor="middle"
                    fill={axisLabelColor}
                    fontSize={axisLabelFontSize}
                    fontWeight={axisLabelFontWeight}
                  >
                    {yAxisLabel}
                  </text>

                  {chart.scaledPoints.map((point) => {
                    const selected = selectedPoint?.id === point.id;
                    const teamStyle = getPointTeamStyle(point, teamColumn, teamMappingByEnglish);
                    const fillColor = teamColumn ? teamStyle.fill : selected ? "#0b7a75" : "#2f7fc4";
                    const shape = teamColumn ? teamStyle.shape : "circle";
                    return (
                      <g
                        key={point.id}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                          setHoverInfo({
                            player: point.playerDisplay,
                            x: point.x,
                            y: point.y,
                            left: e.clientX - rect.left + 10,
                            top: e.clientY - rect.top + 10
                          });
                        }}
                        onMouseMove={(e) => {
                          const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                          setHoverInfo((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  left: e.clientX - rect.left + 10,
                                  top: e.clientY - rect.top + 10
                                }
                              : prev
                          );
                        }}
                        onMouseLeave={() => setHoverInfo(null)}
                        onClick={() => onScatterConfigChange({ selectedPlayerId: point.id })}
                        style={{ cursor: "pointer" }}
                      >
                        {renderPointShape(
                          shape,
                          point.cx,
                          point.cy,
                          selected ? selectedPointSize : pointSize,
                          fillColor,
                          pointStrokeColor,
                          selected ? selectedPointStrokeWidth : pointStrokeWidth
                        )}
                        {showPointPlayerNames ? (
                          <text
                            x={point.cx}
                            y={point.cy - 10}
                            textAnchor="middle"
                            fill={selected ? "#0b7a75" : "#4f453b"}
                            fontSize="11"
                            fontWeight={selected ? "700" : "500"}
                          >
                            {point.playerDisplay}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </svg>

                {hoverInfo ? (
                  <div className="scatter-tooltip" style={{ left: hoverInfo.left, top: hoverInfo.top }}>
                    <div>{hoverInfo.player}</div>
                    <div>{`X: ${hoverInfo.x}`}</div>
                    <div>{`Y: ${hoverInfo.y}`}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="scatter-detail-panel">
            <h3>球员详情</h3>
            {!selectedPoint ? <p>点击散点后在此查看详情。</p> : null}
            {selectedPoint ? (
              <div className="scatter-detail-grid">
                <p>{`球员：${selectedPoint.playerDisplay}`}</p>
                <p>{`X 值（${formatPlayerDataColumnLabel(xCol)}）：${selectedPoint.x}`}</p>
                <p>{`Y 值（${formatPlayerDataColumnLabel(yCol)}）：${selectedPoint.y}`}</p>
                <p>{`X 百分位：${selectedPoint.metrics?.[xCol]?.percentile ?? "-"}`}</p>
                <p>{`Y 百分位：${selectedPoint.metrics?.[yCol]?.percentile ?? "-"}`}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ScatterPlotPage;
