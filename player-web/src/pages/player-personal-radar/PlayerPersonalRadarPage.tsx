import React, { useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "../../app/constants";
import { readLocalStore, writeLocalStore } from "../../utils/localStore";
import { getNameMappingRowsByEnglish, normalizePlayerName } from "../../utils/nameMappingStore";
import { getProjectZhByColumn } from "../../utils/projectMappingStore";

const PLAYER_RADAR_WIDTH = 1080;
const PLAYER_RADAR_HEIGHT = 860;
const PLAYER_RADAR_VIEWBOX_Y = 44;
const PLAYER_RADAR_VIEWBOX_HEIGHT = 772;
const PLAYER_RADAR_CENTER_X = PLAYER_RADAR_WIDTH / 2;
const PLAYER_RADAR_CENTER_Y = 470;
const PLAYER_RADAR_MAX_RADIUS = 290;

const PLAYER_OVERLAY_PALETTE = [
  "#1f77b4",
  "#d62728",
  "#2ca02c",
  "#ff7f0e",
  "#9467bd",
  "#17becf",
  "#8c564b",
  "#e377c2",
  "#bcbd22",
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f"
];

const DEFAULT_PLAYER_PERSONAL_RADAR_CONFIG = {
  title: "个人叠加雷达图",
  subtitle: "数据来源：数据散点图 / 球员数据数据集",
  chartBackgroundColor: "#f8f5ef"
};

type DatasetOption = {
  id?: string;
  name?: string;
};

type PlayerDoc = {
  id?: string;
  player?: string;
  raw?: Record<string, unknown>;
};

type ScatterDoc = {
  players?: PlayerDoc[];
  schema?: {
    numericColumns?: string[];
    lowerBetterColumns?: string[];
  };
};

type PlayerPersonalRadarPageProps = {
  datasetOptions: DatasetOption[];
  selectedDatasetId: string;
  setSelectedDatasetId: (datasetId: string) => void;
  onDeleteCurrentDataset: () => void;
  scatterLoading: boolean;
  scatterError: string;
  scatterDoc: ScatterDoc | null;
  mappingRevision: number;
};

type MetricMinMax = {
  min: number;
  max: number;
};

function parseNumericValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").replace(/%/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatValueDisplay(value: unknown) {
  const num = parseNumericValue(value);
  if (num === null) return String(value ?? "-");
  const abs = Math.abs(num);
  if (abs >= 100) return String(Math.round(num));
  if (abs >= 10) return num.toFixed(1).replace(/\.0$/, "");
  return num.toFixed(2).replace(/\.?0+$/, "");
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function pointAt(centerX: number, centerY: number, radius: number, angle: number) {
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle)
  };
}

function polygonPath(points: Array<{ x: number; y: number }>) {
  if (!Array.isArray(points) || points.length === 0) return "";
  return `${points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")} Z`;
}

function colorToAlpha(hex: string, alpha = 0.22) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeHexColor(value: unknown) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : "";
}

function stripPer90Text(text: string) {
  return String(text || "")
    .replace(/每90分钟/g, "")
    .replace(/\s*per\s*90/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function PlayerPersonalRadarPage({
  datasetOptions,
  selectedDatasetId,
  setSelectedDatasetId,
  onDeleteCurrentDataset,
  scatterLoading,
  scatterError,
  scatterDoc,
  mappingRevision
}: PlayerPersonalRadarPageProps) {
  const [selectedMetricsByDataset, setSelectedMetricsByDataset] = useState<Record<string, string[]>>(
    () => readLocalStore(STORAGE_KEYS.playerPersonalRadarSelectedMetricsByDataset, {})
  );
  const [selectedPlayersByDataset, setSelectedPlayersByDataset] = useState<Record<string, string[]>>(
    () => readLocalStore(STORAGE_KEYS.playerPersonalRadarSelectedPlayersByDataset, {})
  );
  const [selectedOverlayPlayerByDataset, setSelectedOverlayPlayerByDataset] = useState<Record<string, string>>(
    () => readLocalStore(STORAGE_KEYS.playerPersonalRadarSelectedOverlayPlayerByDataset, {})
  );
  const [singleMetricByDataset, setSingleMetricByDataset] = useState<Record<string, string>>(
    () => readLocalStore(STORAGE_KEYS.playerPersonalRadarSingleMetricByDataset, {})
  );
  const [singleMetricScopeByDataset, setSingleMetricScopeByDataset] = useState<Record<string, string>>(
    () => readLocalStore(STORAGE_KEYS.playerPersonalRadarSingleMetricScopeByDataset, {})
  );
  const [playerPersonalRadarConfigByDataset, setPlayerPersonalRadarConfigByDataset] = useState<Record<string, any>>(
    () => readLocalStore(STORAGE_KEYS.playerPersonalRadarConfigByDataset, {})
  );

  const formatMetricLabelZh = (metric: string) => {
    const mappedZh = String(getProjectZhByColumn(metric) || "").trim();
    if (mappedZh) return stripPer90Text(mappedZh);
    return stripPer90Text(metric);
  };

  const nameMappingByEnglish = useMemo(() => getNameMappingRowsByEnglish(), [mappingRevision]);

  const players = useMemo(() => {
    const base = Array.isArray(scatterDoc?.players) ? scatterDoc.players : [];
    return base
      .map((row) => {
        const id = String(row?.id || "").trim();
        if (!id) return null;
        const en = String(row?.player || "").trim();
        const zh = String(nameMappingByEnglish.get(normalizePlayerName(en).toLowerCase())?.zh || "").trim();
        return {
          id,
          name: zh || en || id,
          raw: row?.raw && typeof row.raw === "object" ? row.raw : {}
        };
      })
      .filter((row): row is { id: string; name: string; raw: Record<string, unknown> } => Boolean(row));
  }, [scatterDoc, nameMappingByEnglish]);

  const numericColumns = useMemo(
    () => (Array.isArray(scatterDoc?.schema?.numericColumns) ? scatterDoc.schema.numericColumns.filter((item) => String(item).trim()) : []),
    [scatterDoc]
  );
  const lowerBetterSet = useMemo(() => {
    const list = Array.isArray(scatterDoc?.schema?.lowerBetterColumns) ? scatterDoc.schema.lowerBetterColumns : [];
    return new Set(list.map((item) => String(item)));
  }, [scatterDoc]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.playerPersonalRadarSelectedMetricsByDataset, selectedMetricsByDataset);
  }, [selectedMetricsByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.playerPersonalRadarSelectedPlayersByDataset, selectedPlayersByDataset);
  }, [selectedPlayersByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.playerPersonalRadarSelectedOverlayPlayerByDataset, selectedOverlayPlayerByDataset);
  }, [selectedOverlayPlayerByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.playerPersonalRadarSingleMetricByDataset, singleMetricByDataset);
  }, [singleMetricByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.playerPersonalRadarSingleMetricScopeByDataset, singleMetricScopeByDataset);
  }, [singleMetricScopeByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.playerPersonalRadarConfigByDataset, playerPersonalRadarConfigByDataset);
  }, [playerPersonalRadarConfigByDataset]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    const current = playerPersonalRadarConfigByDataset[ds];
    if (current && typeof current === "object") return;
    setPlayerPersonalRadarConfigByDataset((prev) => ({
      ...prev,
      [ds]: { ...DEFAULT_PLAYER_PERSONAL_RADAR_CONFIG }
    }));
  }, [selectedDatasetId, playerPersonalRadarConfigByDataset]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds || numericColumns.length === 0) return;
    const currentRaw = selectedMetricsByDataset[ds];
    const hasStoredSelection = Array.isArray(currentRaw);
    const current = hasStoredSelection ? currentRaw : [];
    if (!hasStoredSelection) {
      setSelectedMetricsByDataset((prev) => ({ ...prev, [ds]: numericColumns }));
      return;
    }
    const available = new Set(numericColumns);
    const normalized = current.filter((metric) => available.has(metric));
    if (normalized.length !== current.length) {
      setSelectedMetricsByDataset((prev) => ({ ...prev, [ds]: normalized.length > 0 ? normalized : numericColumns }));
    }
  }, [selectedDatasetId, numericColumns, selectedMetricsByDataset]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds || players.length === 0) return;
    const currentRaw = selectedPlayersByDataset[ds];
    const hasStoredSelection = Array.isArray(currentRaw);
    const current = hasStoredSelection ? currentRaw : [];
    const playerIds = players.map((row) => row.id);
    if (!hasStoredSelection) {
      setSelectedPlayersByDataset((prev) => ({ ...prev, [ds]: playerIds.slice(0, 6) }));
      return;
    }
    const available = new Set(playerIds);
    const normalized = current.filter((id) => available.has(id));
    if (normalized.length !== current.length) {
      setSelectedPlayersByDataset((prev) => ({ ...prev, [ds]: normalized.length > 0 ? normalized : playerIds.slice(0, 6) }));
    }
  }, [selectedDatasetId, players, selectedPlayersByDataset]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds || numericColumns.length === 0) return;
    const selectedMetric = String(singleMetricByDataset[ds] || "");
    if (!selectedMetric || !numericColumns.includes(selectedMetric)) {
      setSingleMetricByDataset((prev) => ({ ...prev, [ds]: numericColumns[0] }));
    }
    const scope = String(singleMetricScopeByDataset[ds] || "");
    if (scope !== "all" && scope !== "selected") {
      setSingleMetricScopeByDataset((prev) => ({ ...prev, [ds]: "selected" }));
    }
  }, [selectedDatasetId, numericColumns, singleMetricByDataset, singleMetricScopeByDataset]);

  const selectedMetrics = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const selected = Array.isArray(selectedMetricsByDataset[ds]) ? selectedMetricsByDataset[ds] : [];
    const available = new Set(numericColumns);
    return selected.filter((metric) => available.has(metric));
  }, [selectedDatasetId, selectedMetricsByDataset, numericColumns]);

  const selectedPlayerIds = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const selected = Array.isArray(selectedPlayersByDataset[ds]) ? selectedPlayersByDataset[ds] : [];
    const available = new Set(players.map((row) => row.id));
    return selected.filter((id) => available.has(id));
  }, [selectedDatasetId, selectedPlayersByDataset, players]);

  const visiblePlayers = useMemo(() => {
    const selected = new Set(selectedPlayerIds);
    return players.filter((row) => selected.has(row.id));
  }, [players, selectedPlayerIds]);

  const playerColorMap = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((row, idx) => {
      map.set(row.id, PLAYER_OVERLAY_PALETTE[idx % PLAYER_OVERLAY_PALETTE.length]);
    });
    return map;
  }, [players]);

  const metricMinMaxMap = useMemo(() => {
    const map = new Map<string, MetricMinMax>();
    numericColumns.forEach((metric) => {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      players.forEach((player) => {
        const value = parseNumericValue(player.raw?.[metric]);
        if (value === null) return;
        min = Math.min(min, value);
        max = Math.max(max, value);
      });
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        map.set(metric, { min: 0, max: 0 });
        return;
      }
      map.set(metric, { min, max });
    });
    return map;
  }, [players, numericColumns]);

  const getMetricRatio = (metric: string, value: unknown, stats: MetricMinMax | null) => {
    const num = parseNumericValue(value);
    if (num === null || !stats) return 0;
    const span = stats.max - stats.min;
    if (!Number.isFinite(span) || span === 0) return 0;
    const rawRatio = (num - stats.min) / span;
    const ratio = lowerBetterSet.has(metric) ? 1 - rawRatio : rawRatio;
    return clampRatio(ratio);
  };

  const radarAxisPoints = useMemo(() => {
    const total = selectedMetrics.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return selectedMetrics.map((_, idx) => pointAt(PLAYER_RADAR_CENTER_X, PLAYER_RADAR_CENTER_Y, PLAYER_RADAR_MAX_RADIUS, start + idx * step));
  }, [selectedMetrics]);

  const radarPolygons = useMemo(() => {
    const total = selectedMetrics.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return visiblePlayers.map((player) => {
      const points = selectedMetrics.map((metric, idx) => {
        const stats = metricMinMaxMap.get(metric) || null;
        const ratio = getMetricRatio(metric, player.raw?.[metric], stats);
        return pointAt(PLAYER_RADAR_CENTER_X, PLAYER_RADAR_CENTER_Y, ratio * PLAYER_RADAR_MAX_RADIUS, start + idx * step);
      });
      return {
        id: player.id,
        name: player.name,
        raw: player.raw,
        color: playerColorMap.get(player.id) || "#7b7062",
        points,
        path: polygonPath(points)
      };
    });
  }, [visiblePlayers, selectedMetrics, metricMinMaxMap, playerColorMap]);

  const selectedOverlayPlayerId = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    return String(selectedOverlayPlayerByDataset[ds] || "");
  }, [selectedDatasetId, selectedOverlayPlayerByDataset]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    const current = String(selectedOverlayPlayerByDataset[ds] || "");
    if (!current) return;
    const visibleSet = new Set(visiblePlayers.map((row) => row.id));
    if (!visibleSet.has(current)) {
      setSelectedOverlayPlayerByDataset((prev) => ({ ...prev, [ds]: "" }));
    }
  }, [selectedDatasetId, selectedOverlayPlayerByDataset, visiblePlayers]);

  const selectedOverlayPlayer = useMemo(
    () => radarPolygons.find((poly) => poly.id === selectedOverlayPlayerId) || null,
    [radarPolygons, selectedOverlayPlayerId]
  );

  const orderedRadarPolygons = useMemo(() => {
    if (!selectedOverlayPlayerId) return radarPolygons;
    const selected = radarPolygons.find((poly) => poly.id === selectedOverlayPlayerId);
    if (!selected) return radarPolygons;
    const others = radarPolygons.filter((poly) => poly.id !== selectedOverlayPlayerId);
    return [...others, selected];
  }, [radarPolygons, selectedOverlayPlayerId]);

  const selectedOverlayPlayerInfoRows = useMemo(() => {
    if (!selectedOverlayPlayer) return [];
    return numericColumns.map((metric) => ({
      metric,
      display: formatValueDisplay(selectedOverlayPlayer.raw?.[metric])
    }));
  }, [selectedOverlayPlayer, numericColumns]);

  const singleMetric = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const value = String(singleMetricByDataset[ds] || "");
    if (numericColumns.includes(value)) return value;
    return numericColumns[0] || "";
  }, [selectedDatasetId, singleMetricByDataset, numericColumns]);

  const singleMetricScope = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const value = String(singleMetricScopeByDataset[ds] || "selected");
    return value === "all" ? "all" : "selected";
  }, [selectedDatasetId, singleMetricScopeByDataset]);

  const singleMetricRows = useMemo(() => {
    if (!singleMetric) return [];
    return players
      .map((row) => ({
        id: row.id,
        name: row.name,
        value: parseNumericValue(row.raw?.[singleMetric]),
        rawValue: row.raw?.[singleMetric]
      }))
      .filter((row) => row.value !== null)
      .sort((a, b) => Number(b.value) - Number(a.value));
  }, [singleMetric, players]);

  const singleMetricBaselineRows = useMemo(() => {
    const selectedSet = new Set(selectedPlayerIds);
    const filtered = singleMetricScope === "all" ? singleMetricRows : singleMetricRows.filter((row) => selectedSet.has(row.id));
    return filtered.length > 0 ? filtered : singleMetricRows;
  }, [singleMetricRows, singleMetricScope, selectedPlayerIds]);

  const singleMetricBaseline = useMemo(() => {
    if (singleMetricBaselineRows.length === 0) return { min: 0, max: 0 };
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    singleMetricBaselineRows.forEach((row) => {
      const value = Number(row.value);
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
    return {
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 0
    };
  }, [singleMetricBaselineRows]);

  const togglePlayerVisible = (playerId: string) => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedPlayersByDataset((prev) => {
      const current = Array.isArray(prev[ds]) ? prev[ds] : [];
      const next = current.includes(playerId) ? current.filter((item) => item !== playerId) : [...current, playerId];
      return { ...prev, [ds]: next };
    });
  };

  const toggleMetric = (metric: string) => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedMetricsByDataset((prev) => {
      const current = Array.isArray(prev[ds]) ? prev[ds] : [];
      const next = current.includes(metric) ? current.filter((item) => item !== metric) : [...current, metric];
      return { ...prev, [ds]: next };
    });
  };

  const toggleOverlayPlayerSelection = (playerId: string) => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedOverlayPlayerByDataset((prev) => {
      const current = String(prev[ds] || "");
      return { ...prev, [ds]: current === playerId ? "" : playerId };
    });
  };

  const selectAllMetrics = () => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedMetricsByDataset((prev) => ({ ...prev, [ds]: numericColumns }));
  };

  const clearMetrics = () => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedMetricsByDataset((prev) => ({ ...prev, [ds]: [] }));
  };

  const selectAllPlayers = () => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedPlayersByDataset((prev) => ({ ...prev, [ds]: players.map((row) => row.id) }));
  };

  const clearPlayers = () => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedPlayersByDataset((prev) => ({ ...prev, [ds]: [] }));
  };

  const playerPersonalRadarConfig = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const base = ds && playerPersonalRadarConfigByDataset[ds] && typeof playerPersonalRadarConfigByDataset[ds] === "object"
      ? playerPersonalRadarConfigByDataset[ds]
      : {};
    return { ...DEFAULT_PLAYER_PERSONAL_RADAR_CONFIG, ...base };
  }, [selectedDatasetId, playerPersonalRadarConfigByDataset]);

  const playerPersonalChartBackgroundColor = normalizeHexColor(playerPersonalRadarConfig.chartBackgroundColor) || "#f8f5ef";

  const updatePlayerPersonalRadarConfig = (patch: any) => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setPlayerPersonalRadarConfigByDataset((prev) => ({
      ...prev,
      [ds]: { ...(prev[ds] && typeof prev[ds] === "object" ? prev[ds] : DEFAULT_PLAYER_PERSONAL_RADAR_CONFIG), ...patch }
    }));
  };

  return (
    <section className="info-page">
      <div className="info-card fitness-page-shell player-personal-radar-page">
        <h1>个人雷达图</h1>
        <p>数据源复用“球员数据/数据散点图”已导入的数据集；可做多球员叠加雷达与单项比较。</p>

        <div className="fitness-top-bar">
          <div className="title-row">
            <label>导入数据集</label>
            <select value={selectedDatasetId} onChange={(e) => setSelectedDatasetId(e.target.value)} disabled={datasetOptions.length === 0}>
              {datasetOptions.length === 0 ? <option value="">暂无已导入数据集</option> : null}
              {datasetOptions.map((item) => (
                <option key={String(item.id || "")} value={String(item.id || "")}>
                  {String(item.name || item.id || "")}
                </option>
              ))}
            </select>
          </div>
          <div className="btn-row">
            <button onClick={onDeleteCurrentDataset} disabled={!selectedDatasetId || scatterLoading}>
              删除当前数据集
            </button>
          </div>
        </div>

        <div className="fitness-meta-row">
          <p>{`球员数：${players.length}`}</p>
          <p>{`数值指标数：${numericColumns.length}`}</p>
        </div>

        {scatterError ? <p className="msg err">{scatterError}</p> : null}

        <div className="fitness-layout">
          <div className="fitness-left-col">
            <div className="fitness-card">
              <h2>指标与球员筛选</h2>

              <div className="match-radar-grid-2">
                <div className="title-row">
                  <label>主标题</label>
                  <input value={playerPersonalRadarConfig.title} onChange={(e) => updatePlayerPersonalRadarConfig({ title: e.target.value })} />
                </div>
                <div className="title-row">
                  <label>副标题</label>
                  <input value={playerPersonalRadarConfig.subtitle} onChange={(e) => updatePlayerPersonalRadarConfig({ subtitle: e.target.value })} />
                </div>
              </div>

              <div className="title-row">
                <label>背景色</label>
                <input className="square-color-picker" type="color" value={playerPersonalChartBackgroundColor} onChange={(e) => updatePlayerPersonalRadarConfig({ chartBackgroundColor: e.target.value })} />
              </div>

              <div className="fitness-metric-actions">
                <div className="fitness-summary-row">
                  <p>{`已勾选指标：${selectedMetrics.length}/${numericColumns.length}`}</p>
                  <div className="btn-row">
                    <button onClick={selectAllMetrics} disabled={numericColumns.length === 0}>全选指标</button>
                    <button onClick={clearMetrics} disabled={numericColumns.length === 0}>清空指标</button>
                  </div>
                </div>
                <div className="fitness-summary-row">
                  <p>{`已勾选球员：${selectedPlayerIds.length}/${players.length}`}</p>
                  <div className="btn-row">
                    <button onClick={selectAllPlayers} disabled={players.length === 0}>全选球员</button>
                    <button onClick={clearPlayers} disabled={players.length === 0}>清空球员</button>
                  </div>
                </div>
              </div>

              <div className="fitness-check-grid">
                {numericColumns.map((metric) => (
                  <label key={metric} className="fitness-check-item">
                    <input type="checkbox" checked={selectedMetrics.includes(metric)} onChange={() => toggleMetric(metric)} />
                    <span>{formatMetricLabelZh(metric)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="fitness-card">
              <h2>单项比较</h2>
              <div className="match-radar-grid-2">
                <div className="title-row">
                  <label>选择指标</label>
                  <select
                    value={singleMetric}
                    onChange={(e) => {
                      const ds = String(selectedDatasetId || "");
                      if (!ds) return;
                      setSingleMetricByDataset((prev) => ({ ...prev, [ds]: e.target.value }));
                    }}
                  >
                    {numericColumns.map((metric) => (
                      <option key={metric} value={metric}>
                        {formatMetricLabelZh(metric)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="title-row">
                  <label>比较范围</label>
                  <select
                    value={singleMetricScope}
                    onChange={(e) => {
                      const ds = String(selectedDatasetId || "");
                      if (!ds) return;
                      setSingleMetricScopeByDataset((prev) => ({ ...prev, [ds]: e.target.value }));
                    }}
                  >
                    <option value="selected">仅勾选球员</option>
                    <option value="all">全部球员</option>
                  </select>
                </div>
              </div>

              <div className="fitness-bars-wrap">
                {singleMetricRows.length === 0 ? <p className="fitness-empty">暂无可用数据。</p> : null}
                {singleMetricRows.map((row) => {
                  const checked = selectedPlayerIds.includes(row.id);
                  const ratio = getMetricRatio(singleMetric, row.value, singleMetricBaseline);
                  const color = playerColorMap.get(row.id) || "#7b7062";
                  const display = formatValueDisplay(row.rawValue);
                  return (
                    <div className="fitness-bar-row" key={row.id}>
                      <div className="fitness-bar-check">
                        <input type="checkbox" checked={checked} onChange={() => togglePlayerVisible(row.id)} />
                      </div>
                      <div className="fitness-bar-name">{row.name}</div>
                      <div className="fitness-bar-track">
                        <div className="fitness-bar-fill" style={{ width: `${ratio * 100}%`, background: color }} />
                      </div>
                      <div className="fitness-bar-value">{display}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="fitness-right-col">
            <div className="fitness-card fitness-chart-card overlay-radar-chart-card">
              <svg viewBox={`0 ${PLAYER_RADAR_VIEWBOX_Y} ${PLAYER_RADAR_WIDTH} ${PLAYER_RADAR_VIEWBOX_HEIGHT}`} id="player-personal-radar-svg">
                <rect x="0" y="0" width={PLAYER_RADAR_WIDTH} height={PLAYER_RADAR_HEIGHT} fill={playerPersonalChartBackgroundColor} />

                <text x={PLAYER_RADAR_CENTER_X} y="48" textAnchor="middle" fontSize="34" fontWeight="700" fill="#2f2a24">
                  {playerPersonalRadarConfig.title}
                </text>
                <text x={PLAYER_RADAR_CENTER_X} y="80" textAnchor="middle" fontSize="16" fill="#5f5850">
                  {playerPersonalRadarConfig.subtitle}
                </text>

                {[20, 40, 60, 80, 100].map((tick) => (
                  <circle
                    key={tick}
                    cx={PLAYER_RADAR_CENTER_X}
                    cy={PLAYER_RADAR_CENTER_Y}
                    r={(tick / 100) * PLAYER_RADAR_MAX_RADIUS}
                    fill="none"
                    stroke="#d9cfbf"
                    strokeDasharray="4 6"
                  />
                ))}

                {radarAxisPoints.map((pt, idx) => (
                  <line key={idx} x1={PLAYER_RADAR_CENTER_X} y1={PLAYER_RADAR_CENTER_Y} x2={pt.x} y2={pt.y} stroke="#c8bfb2" />
                ))}

                {orderedRadarPolygons.map((poly) => (
                  <g key={poly.id}>
                    <path
                      className={`fitness-overlay-polygon${selectedOverlayPlayerId === poly.id ? " is-selected" : ""}`}
                      d={poly.path}
                      fill={colorToAlpha(poly.color, selectedOverlayPlayerId === poly.id ? 0.7 : 0.1)}
                      stroke={poly.color}
                      strokeWidth={selectedOverlayPlayerId === poly.id ? "3.5" : "2"}
                      onClick={() => toggleOverlayPlayerSelection(poly.id)}
                    />
                    {poly.points.map((pt, idx) => (
                      <circle key={`${poly.id}-${idx}`} cx={pt.x} cy={pt.y} r="4" fill={poly.color} />
                    ))}
                  </g>
                ))}

                {selectedMetrics.map((metric, idx) => {
                  const labelPt = pointAt(
                    PLAYER_RADAR_CENTER_X,
                    PLAYER_RADAR_CENTER_Y,
                    PLAYER_RADAR_MAX_RADIUS + 34,
                    -Math.PI / 2 + ((Math.PI * 2) / selectedMetrics.length) * idx
                  );
                  return (
                    <text key={metric} x={labelPt.x} y={labelPt.y} textAnchor="middle" fontSize="18" fontWeight="700" fill="#342f29">
                      {formatMetricLabelZh(metric)}
                    </text>
                  );
                })}

                <g>
                  {radarPolygons.map((poly, idx) => (
                    <g key={`legend-${poly.id}`} transform={`translate(28 ${120 + idx * 24})`} className="fitness-overlay-legend-item" onClick={() => toggleOverlayPlayerSelection(poly.id)}>
                      <rect x="0" y="-12" width="12" height="12" fill={poly.color} />
                      <text x="18" y="-2" fontSize="14" fill={selectedOverlayPlayerId === poly.id ? "#111" : "#2f2a24"} fontWeight={selectedOverlayPlayerId === poly.id ? "700" : "400"}>
                        {poly.name}
                      </text>
                    </g>
                  ))}
                </g>
              </svg>
              {selectedMetrics.length < 3 ? <p className="fitness-empty">提示：雷达图建议至少勾选 3 个指标。</p> : null}
              {visiblePlayers.length === 0 ? <p className="fitness-empty">提示：请至少勾选 1 名球员以显示叠加雷达。</p> : null}
            </div>

            <div className="fitness-player-detail-card">
              {selectedOverlayPlayer ? (
                <>
                  <h3>{`已选球员：${selectedOverlayPlayer.name}`}</h3>
                  <div className="fitness-player-detail-grid">
                    {selectedOverlayPlayerInfoRows.map((row) => (
                      <div key={row.metric} className="fitness-player-detail-row">
                        <span className="fitness-player-detail-metric">{formatMetricLabelZh(row.metric)}</span>
                        <span className="fitness-player-detail-value">{row.display}</span>
                      </div>
                    ))}
                  </div>
                  <p className="fitness-empty">备注：图中长度按原始值归一化；低优指标自动反向。</p>
                </>
              ) : (
                <p className="fitness-empty">点击图中任意球员封闭区域或左侧图例，可查看该球员全部指标。</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PlayerPersonalRadarPage;
