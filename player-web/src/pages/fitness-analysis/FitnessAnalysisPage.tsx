import React, { useEffect, useMemo, useRef, useState } from "react";
import { checkHealth, deleteFitnessDataset, fetchFitnessDataset, fetchFitnessDatasets, importFitnessExcel } from "../../api/storageClient";
import { STORAGE_KEYS } from "../../app/constants";
import { readLocalStore, writeLocalStore } from "../../utils/localStore";
import { getTeamMappingRowsByName, normalizeTeamName } from "../../utils/teamMappingStore";
import { formatDateTime } from "../../utils/timeFormat";

const TEAM_RADAR_WIDTH = 1080;
const TEAM_RADAR_HEIGHT = 860;
const TEAM_RADAR_CENTER_X = TEAM_RADAR_WIDTH / 2;
const TEAM_RADAR_CENTER_Y = 470;
const TEAM_RADAR_MAX_RADIUS = 290;

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

const DEFAULT_TEAM_RADAR_CONFIG = {
  title: "体能对比雷达图",
  subtitle: "数据来源：体能数据分析 / 第1个Sheet",
  homeColor: "#2f7fc4",
  awayColor: "#c62828",
  chartBackgroundColor: "#f8f5ef",
  pointRadius: "4",
  titleFontSize: "34"
};

const DEFAULT_PLAYER_RADAR_CONFIG = {
  title: "球员体能叠加雷达图",
  subtitle: "数据来源：体能数据分析 / 第2个Sheet",
  chartBackgroundColor: "#f8f5ef"
};

function normalizeHexColor(value: unknown) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : "";
}

function parseNumericValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").replace(/%/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function isPercentMetric(metric: unknown) {
  const text = String(metric || "").trim().toLowerCase();
  if (!text) return false;
  return text.includes("%") || text.includes("percent") || text.includes("ratio") || text.includes("率") || text.includes("占比") || text.includes("比率");
}

function isOneDecimalMetric(metric: unknown) {
  const text = String(metric || "").trim().toLowerCase();
  if (!text) return false;
  return text.includes("平均速度") || text.includes("最快速度") || text.includes("average speed") || text.includes("max speed");
}

function formatFitnessDisplayValue(value: unknown, metric: unknown) {
  const num = parseNumericValue(value);
  if (num === null) return String(value ?? "");
  if (isPercentMetric(metric)) {
    const normalized = Math.abs(num) <= 1 ? num * 100 : num;
    return normalized.toFixed(1);
  }
  if (isOneDecimalMetric(metric)) {
    return num.toFixed(1);
  }
  return String(Math.round(num));
}

function clampPointRadius(value: unknown, min = 2, max = 10, fallback = 4) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function clampTitleFontSize(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 34;
  return Math.max(20, Math.min(64, num));
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

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function containsChinese(text: string) {
  return /[\u3400-\u9fff]/.test(String(text || ""));
}

function getDisplayTeamName(teamName: string, mapping: Map<string, any>) {
  if (containsChinese(teamName)) return teamName;
  const key = normalizeTeamName(teamName).toLowerCase();
  const mapped = mapping.get(key);
  const zh = String(mapped?.zh || "").trim();
  return zh || teamName;
}

function getTeamLogoSrc(teamName: string, mapping: Map<string, any>) {
  const key = normalizeTeamName(teamName).toLowerCase();
  return String(mapping.get(key)?.logoDataUrl || "").trim();
}

type FitnessAnalysisPageProps = {
  view?: "team" | "player";
};

function FitnessAnalysisPage({ view = "team" }: FitnessAnalysisPageProps) {
  const isTeamView = view === "team";
  const isPlayerView = view === "player";
  const [backendHealth, setBackendHealth] = useState("checking");
  const [datasetOptions, setDatasetOptions] = useState([] as any[]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(() => {
    const shared = String(readLocalStore(STORAGE_KEYS.fitnessSharedDatasetId, "") || "");
    const local = String(readLocalStore(STORAGE_KEYS.fitnessSelectedDatasetId, "") || "");
    return shared || local;
  });
  const [datasetDoc, setDatasetDoc] = useState(null as any);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [selectedTeamMetricsByDataset, setSelectedTeamMetricsByDataset] = useState(() => readLocalStore(STORAGE_KEYS.fitnessSelectedTeamMetricsByDataset, {}));
  const [teamMetricMaxByDataset, setTeamMetricMaxByDataset] = useState(() => readLocalStore(STORAGE_KEYS.fitnessTeamMetricMaxByDataset, {}));
  const [selectedPlayerMetricsByDataset, setSelectedPlayerMetricsByDataset] = useState(() => readLocalStore(STORAGE_KEYS.fitnessSelectedPlayerMetricsByDataset, {}));
  const [selectedPlayersByDataset, setSelectedPlayersByDataset] = useState(() => readLocalStore(STORAGE_KEYS.fitnessSelectedPlayersByDataset, {}));
  const [selectedOverlayPlayerByDataset, setSelectedOverlayPlayerByDataset] = useState(() => readLocalStore(STORAGE_KEYS.fitnessSelectedOverlayPlayerByDataset, {}));
  const [singleMetricByDataset, setSingleMetricByDataset] = useState(() => readLocalStore(STORAGE_KEYS.fitnessSingleMetricByDataset, {}));
  const [singleMetricScopeByDataset, setSingleMetricScopeByDataset] = useState(() => readLocalStore(STORAGE_KEYS.fitnessSingleMetricScopeByDataset, {}));
  const [teamRadarConfigByDataset, setTeamRadarConfigByDataset] = useState(() => readLocalStore(STORAGE_KEYS.fitnessTeamRadarConfigByDataset, {}));
  const [playerRadarConfigByDataset, setPlayerRadarConfigByDataset] = useState(() => readLocalStore(STORAGE_KEYS.fitnessPlayerRadarConfigByDataset, {}));

  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const teamMapping = useMemo(() => getTeamMappingRowsByName(), []);

  const teamSheet = datasetDoc?.teamSheet || null;
  const playerSheet = datasetDoc?.playerSheet || null;

  const teams = useMemo(() => {
    const rawTeams = Array.isArray(teamSheet?.teams) ? teamSheet.teams : [];
    return rawTeams.slice(0, 2);
  }, [teamSheet]);

  const homeTeam = teams[0] || null;
  const awayTeam = teams[1] || null;

  const homeTeamDisplayName = useMemo(() => getDisplayTeamName(String(homeTeam?.team || "主队"), teamMapping), [homeTeam, teamMapping]);
  const awayTeamDisplayName = useMemo(() => getDisplayTeamName(String(awayTeam?.team || "客队"), teamMapping), [awayTeam, teamMapping]);
  const homeTeamLogoSrc = useMemo(() => getTeamLogoSrc(String(homeTeam?.team || ""), teamMapping), [homeTeam, teamMapping]);
  const awayTeamLogoSrc = useMemo(() => getTeamLogoSrc(String(awayTeam?.team || ""), teamMapping), [awayTeam, teamMapping]);

  const availableTeamMetrics = useMemo(() => {
    const base = Array.isArray(teamSheet?.numericColumns) ? teamSheet.numericColumns : [];
    if (!homeTeam || !awayTeam) return [];
    return base.filter((column: string) => parseNumericValue(homeTeam?.raw?.[column]) !== null && parseNumericValue(awayTeam?.raw?.[column]) !== null);
  }, [teamSheet, homeTeam, awayTeam]);

  const playerRows = useMemo(() => (Array.isArray(playerSheet?.players) ? playerSheet.players : []), [playerSheet]);
  const availablePlayerMetrics = useMemo(() => (Array.isArray(playerSheet?.numericColumns) ? playerSheet.numericColumns : []), [playerSheet]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.fitnessSelectedDatasetId, selectedDatasetId);
    writeLocalStore(STORAGE_KEYS.fitnessSharedDatasetId, selectedDatasetId);
  }, [selectedDatasetId]);

  useEffect(() => {
    const handler = () => {
      const shared = String(readLocalStore(STORAGE_KEYS.fitnessSharedDatasetId, "") || "");
      if (!shared) return;
      setSelectedDatasetId((prev) => (prev === shared ? prev : shared));
    };
    window.addEventListener("fitness-dataset-updated", handler as EventListener);
    return () => window.removeEventListener("fitness-dataset-updated", handler as EventListener);
  }, []);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.fitnessSelectedTeamMetricsByDataset, selectedTeamMetricsByDataset);
  }, [selectedTeamMetricsByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.fitnessTeamMetricMaxByDataset, teamMetricMaxByDataset);
  }, [teamMetricMaxByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.fitnessSelectedPlayerMetricsByDataset, selectedPlayerMetricsByDataset);
  }, [selectedPlayerMetricsByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.fitnessSelectedPlayersByDataset, selectedPlayersByDataset);
  }, [selectedPlayersByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.fitnessSelectedOverlayPlayerByDataset, selectedOverlayPlayerByDataset);
  }, [selectedOverlayPlayerByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.fitnessSingleMetricByDataset, singleMetricByDataset);
  }, [singleMetricByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.fitnessSingleMetricScopeByDataset, singleMetricScopeByDataset);
  }, [singleMetricScopeByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.fitnessTeamRadarConfigByDataset, teamRadarConfigByDataset);
  }, [teamRadarConfigByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.fitnessPlayerRadarConfigByDataset, playerRadarConfigByDataset);
  }, [playerRadarConfigByDataset]);

  const verifyBackendHealth = async () => {
    try {
      await checkHealth();
      setBackendHealth("online");
      return true;
    } catch {
      setBackendHealth("offline");
      return false;
    }
  };

  const loadDatasets = async (preferredDatasetId = "") => {
    try {
      const res = await fetchFitnessDatasets();
      const datasets = Array.isArray(res.datasets) ? res.datasets : [];
      setDatasetOptions(datasets);
      if (datasets.length === 0) {
        setSelectedDatasetId("");
        setDatasetDoc(null);
        return "";
      }
      const serverSelected = String(res.selectedDatasetId || "");
      const firstId = String(datasets[0]?.id || "");
      const fallbackId = serverSelected || firstId;
      const currentLocal = String(readLocalStore(STORAGE_KEYS.fitnessSelectedDatasetId, "") || "");
      const candidate = preferredDatasetId || selectedDatasetId || currentLocal;
      const matched = candidate && datasets.some((item) => item.id === candidate);
      const nextId = matched ? candidate : fallbackId;
      setSelectedDatasetId(nextId);
      return nextId;
    } catch (err: any) {
      setError(`体能数据集读取失败：${err.message}`);
      setDatasetOptions([]);
      setSelectedDatasetId("");
      setDatasetDoc(null);
      return "";
    }
  };

  const loadDatasetDetail = async (datasetId: string) => {
    if (!datasetId) {
      setDatasetDoc(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchFitnessDataset(datasetId);
      setDatasetDoc(res.data || null);
    } catch (err: any) {
      setError(`体能数据读取失败：${err.message}`);
      setDatasetDoc(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verifyBackendHealth();
    loadDatasets();
  }, []);

  useEffect(() => {
    if (!selectedDatasetId) {
      setDatasetDoc(null);
      return;
    }
    loadDatasetDetail(selectedDatasetId);
  }, [selectedDatasetId]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds || availableTeamMetrics.length === 0) return;
    const currentRaw = selectedTeamMetricsByDataset[ds];
    const hasStoredSelection = Array.isArray(currentRaw);
    const current = hasStoredSelection ? currentRaw : [];
    if (!hasStoredSelection) {
      setSelectedTeamMetricsByDataset((prev: any) => ({ ...prev, [ds]: availableTeamMetrics }));
      return;
    }
    const availableSet = new Set(availableTeamMetrics);
    const normalized = current.filter((col: string) => availableSet.has(col));
    if (normalized.length !== current.length) {
      setSelectedTeamMetricsByDataset((prev: any) => ({ ...prev, [ds]: normalized.length > 0 ? normalized : availableTeamMetrics }));
    }
  }, [selectedDatasetId, availableTeamMetrics, selectedTeamMetricsByDataset]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds || availablePlayerMetrics.length === 0) return;
    const currentRaw = selectedPlayerMetricsByDataset[ds];
    const hasStoredSelection = Array.isArray(currentRaw);
    const current = hasStoredSelection ? currentRaw : [];
    if (!hasStoredSelection) {
      setSelectedPlayerMetricsByDataset((prev: any) => ({ ...prev, [ds]: availablePlayerMetrics }));
      return;
    }
    const availableSet = new Set(availablePlayerMetrics);
    const normalized = current.filter((col: string) => availableSet.has(col));
    if (normalized.length !== current.length) {
      setSelectedPlayerMetricsByDataset((prev: any) => ({ ...prev, [ds]: normalized.length > 0 ? normalized : availablePlayerMetrics }));
    }
  }, [selectedDatasetId, availablePlayerMetrics, selectedPlayerMetricsByDataset]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds || playerRows.length === 0) return;
    const currentRaw = selectedPlayersByDataset[ds];
    const hasStoredSelection = Array.isArray(currentRaw);
    const current = hasStoredSelection ? currentRaw : [];
    const playerIds = playerRows.map((row: any) => String(row.id));
    if (!hasStoredSelection) {
      setSelectedPlayersByDataset((prev: any) => ({ ...prev, [ds]: playerIds }));
      return;
    }
    const playerSet = new Set(playerIds);
    const normalized = current.filter((id: string) => playerSet.has(id));
    if (normalized.length !== current.length) {
      setSelectedPlayersByDataset((prev: any) => ({ ...prev, [ds]: normalized.length > 0 ? normalized : playerIds }));
    }
  }, [selectedDatasetId, playerRows, selectedPlayersByDataset]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds || availablePlayerMetrics.length === 0) return;
    const selectedMetric = String(singleMetricByDataset[ds] || "");
    if (!selectedMetric || !availablePlayerMetrics.includes(selectedMetric)) {
      setSingleMetricByDataset((prev: any) => ({ ...prev, [ds]: availablePlayerMetrics[0] }));
    }

    const scope = String(singleMetricScopeByDataset[ds] || "");
    if (scope !== "all" && scope !== "selected") {
      setSingleMetricScopeByDataset((prev: any) => ({ ...prev, [ds]: "selected" }));
    }
  }, [selectedDatasetId, availablePlayerMetrics, singleMetricByDataset, singleMetricScopeByDataset]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds || !homeTeam || !awayTeam) return;
    const current = teamRadarConfigByDataset[ds];
    if (current && typeof current === "object") return;
    const inheritedSubtitle = Object.values(teamRadarConfigByDataset || {}).find((item: any) => String(item?.subtitle || "").trim()) as any;
    const mappedHomeColor = normalizeHexColor(teamMapping.get(normalizeTeamName(String(homeTeam.team || "")).toLowerCase())?.color || "");
    const mappedAwayColor = normalizeHexColor(teamMapping.get(normalizeTeamName(String(awayTeam.team || "")).toLowerCase())?.color || "");
    setTeamRadarConfigByDataset((prev: any) => ({
      ...prev,
      [ds]: {
        ...DEFAULT_TEAM_RADAR_CONFIG,
        subtitle: String(inheritedSubtitle?.subtitle || DEFAULT_TEAM_RADAR_CONFIG.subtitle),
        homeColor: mappedHomeColor || DEFAULT_TEAM_RADAR_CONFIG.homeColor,
        awayColor: mappedAwayColor || DEFAULT_TEAM_RADAR_CONFIG.awayColor
      }
    }));
  }, [selectedDatasetId, homeTeam, awayTeam, teamRadarConfigByDataset, teamMapping]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    const current = playerRadarConfigByDataset[ds];
    if (current && typeof current === "object") return;
    setPlayerRadarConfigByDataset((prev: any) => ({
      ...prev,
      [ds]: { ...DEFAULT_PLAYER_RADAR_CONFIG }
    }));
  }, [selectedDatasetId, playerRadarConfigByDataset]);

  const selectedTeamMetrics = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const selected = Array.isArray(selectedTeamMetricsByDataset[ds]) ? selectedTeamMetricsByDataset[ds] : [];
    const availableSet = new Set(availableTeamMetrics);
    return selected.filter((col: string) => availableSet.has(col));
  }, [selectedDatasetId, selectedTeamMetricsByDataset, availableTeamMetrics]);

  const selectedPlayerMetrics = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const selected = Array.isArray(selectedPlayerMetricsByDataset[ds]) ? selectedPlayerMetricsByDataset[ds] : [];
    const availableSet = new Set(availablePlayerMetrics);
    return selected.filter((col: string) => availableSet.has(col));
  }, [selectedDatasetId, selectedPlayerMetricsByDataset, availablePlayerMetrics]);

  const selectedPlayerIds = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const selected = Array.isArray(selectedPlayersByDataset[ds]) ? selectedPlayersByDataset[ds] : [];
    const allIds = new Set(playerRows.map((row: any) => String(row.id)));
    return selected.filter((id: string) => allIds.has(id));
  }, [selectedDatasetId, selectedPlayersByDataset, playerRows]);

  const teamRadarConfig = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const base = teamRadarConfigByDataset[ds] && typeof teamRadarConfigByDataset[ds] === "object" ? teamRadarConfigByDataset[ds] : {};
    return { ...DEFAULT_TEAM_RADAR_CONFIG, ...base };
  }, [selectedDatasetId, teamRadarConfigByDataset]);

  const playerRadarConfig = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const base = playerRadarConfigByDataset[ds] && typeof playerRadarConfigByDataset[ds] === "object" ? playerRadarConfigByDataset[ds] : {};
    return { ...DEFAULT_PLAYER_RADAR_CONFIG, ...base };
  }, [selectedDatasetId, playerRadarConfigByDataset]);

  const updateTeamRadarConfig = (patch: any) => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setTeamRadarConfigByDataset((prev: any) => ({
      ...prev,
      [ds]: { ...(prev[ds] && typeof prev[ds] === "object" ? prev[ds] : DEFAULT_TEAM_RADAR_CONFIG), ...patch }
    }));
  };

  const updatePlayerRadarConfig = (patch: any) => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setPlayerRadarConfigByDataset((prev: any) => ({
      ...prev,
      [ds]: { ...(prev[ds] && typeof prev[ds] === "object" ? prev[ds] : DEFAULT_PLAYER_RADAR_CONFIG), ...patch }
    }));
  };

  const datasetTeamMetricMaxMap = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const current = ds ? teamMetricMaxByDataset[ds] : null;
    return current && typeof current === "object" ? current : {};
  }, [selectedDatasetId, teamMetricMaxByDataset]);

  const teamMetricRows = useMemo(() => {
    if (!homeTeam || !awayTeam) return [];
    const selectedSet = new Set(selectedTeamMetrics);
    return availableTeamMetrics
      .map((column: string) => {
        const homeValue = parseNumericValue(homeTeam?.raw?.[column]);
        const awayValue = parseNumericValue(awayTeam?.raw?.[column]);
        if (homeValue === null || awayValue === null) return null;
        const autoMax = Math.max(Math.abs(homeValue), Math.abs(awayValue)) * 1.1 || 1;
        const manualMaxRaw = String(datasetTeamMetricMaxMap[column] ?? "").trim();
        const manualMax = parseNumericValue(manualMaxRaw);
        const resolvedMax = manualMax !== null && manualMax > 0 ? manualMax : autoMax;
        return {
          column,
          metric: column,
          selected: selectedSet.has(column),
          homeRaw: String(homeTeam?.raw?.[column] ?? ""),
          awayRaw: String(awayTeam?.raw?.[column] ?? ""),
          homeDisplay: formatFitnessDisplayValue(homeTeam?.raw?.[column], column),
          awayDisplay: formatFitnessDisplayValue(awayTeam?.raw?.[column], column),
          homeValue,
          awayValue,
          autoMax,
          autoMaxDisplay: formatFitnessDisplayValue(autoMax, column),
          manualMaxRaw,
          resolvedMax
        };
      })
      .filter(Boolean) as any[];
  }, [availableTeamMetrics, selectedTeamMetrics, homeTeam, awayTeam, datasetTeamMetricMaxMap]);

  const selectedTeamMetricRows = useMemo(() => teamMetricRows.filter((row: any) => row.selected), [teamMetricRows]);

  const teamAxisPoints = useMemo(() => {
    const total = selectedTeamMetricRows.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return selectedTeamMetricRows.map((_: any, idx: number) => pointAt(TEAM_RADAR_CENTER_X, TEAM_RADAR_CENTER_Y, TEAM_RADAR_MAX_RADIUS, start + idx * step));
  }, [selectedTeamMetricRows]);

  const teamHomePoints = useMemo(() => {
    const total = selectedTeamMetricRows.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return selectedTeamMetricRows.map((row: any, idx: number) => {
      const ratio = row.resolvedMax > 0 ? clampRatio(row.homeValue / row.resolvedMax) : 0;
      return pointAt(TEAM_RADAR_CENTER_X, TEAM_RADAR_CENTER_Y, ratio * TEAM_RADAR_MAX_RADIUS, start + idx * step);
    });
  }, [selectedTeamMetricRows]);

  const teamAwayPoints = useMemo(() => {
    const total = selectedTeamMetricRows.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return selectedTeamMetricRows.map((row: any, idx: number) => {
      const ratio = row.resolvedMax > 0 ? clampRatio(row.awayValue / row.resolvedMax) : 0;
      return pointAt(TEAM_RADAR_CENTER_X, TEAM_RADAR_CENTER_Y, ratio * TEAM_RADAR_MAX_RADIUS, start + idx * step);
    });
  }, [selectedTeamMetricRows]);

  const teamHomePath = polygonPath(teamHomePoints);
  const teamAwayPath = polygonPath(teamAwayPoints);

  const visiblePlayers = useMemo(() => {
    const selectedSet = new Set(selectedPlayerIds);
    return playerRows.filter((row: any) => selectedSet.has(String(row.id)));
  }, [playerRows, selectedPlayerIds]);

  const playerMetricMaxMap = useMemo(() => {
    const map = new Map<string, number>();
    availablePlayerMetrics.forEach((metric: string) => {
      let max = 0;
      playerRows.forEach((row: any) => {
        const value = parseNumericValue(row?.raw?.[metric]);
        if (value === null) return;
        max = Math.max(max, Math.abs(value));
      });
      map.set(metric, max > 0 ? max : 1);
    });
    return map;
  }, [availablePlayerMetrics, playerRows]);

  const playerRadarMetrics = selectedPlayerMetrics;

  const playerColorMap = useMemo(() => {
    const map = new Map<string, string>();
    playerRows.forEach((player: any, idx: number) => {
      map.set(String(player.id), PLAYER_OVERLAY_PALETTE[idx % PLAYER_OVERLAY_PALETTE.length]);
    });
    return map;
  }, [playerRows]);

  const playerAxisPoints = useMemo(() => {
    const total = playerRadarMetrics.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return playerRadarMetrics.map((_: any, idx: number) => pointAt(PLAYER_RADAR_CENTER_X, PLAYER_RADAR_CENTER_Y, PLAYER_RADAR_MAX_RADIUS, start + idx * step));
  }, [playerRadarMetrics]);

  const playerRadarPolygons = useMemo(() => {
    const total = playerRadarMetrics.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;

    return visiblePlayers.map((player: any, playerIdx: number) => {
      const points = playerRadarMetrics.map((metric: string, idx: number) => {
        const value = parseNumericValue(player?.raw?.[metric]) || 0;
        const maxValue = Number(playerMetricMaxMap.get(metric) || 1);
        const ratio = maxValue > 0 ? clampRatio(value / maxValue) : 0;
        return pointAt(PLAYER_RADAR_CENTER_X, PLAYER_RADAR_CENTER_Y, ratio * PLAYER_RADAR_MAX_RADIUS, start + idx * step);
      });
      const name = String(player.player || "");
      const color = playerColorMap.get(String(player.id)) || PLAYER_OVERLAY_PALETTE[playerIdx % PLAYER_OVERLAY_PALETTE.length];
      return {
        id: String(player.id),
        name,
        raw: player?.raw || {},
        color,
        points,
        path: polygonPath(points)
      };
    });
  }, [visiblePlayers, playerRadarMetrics, playerMetricMaxMap, playerColorMap]);

  const selectedOverlayPlayerId = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    return String(selectedOverlayPlayerByDataset[ds] || "");
  }, [selectedDatasetId, selectedOverlayPlayerByDataset]);

  useEffect(() => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    const selectedId = String(selectedOverlayPlayerByDataset[ds] || "");
    if (!selectedId) return;
    const visibleIdSet = new Set(visiblePlayers.map((row: any) => String(row.id)));
    if (!visibleIdSet.has(selectedId)) {
      setSelectedOverlayPlayerByDataset((prev: any) => ({ ...prev, [ds]: "" }));
    }
  }, [selectedDatasetId, selectedOverlayPlayerByDataset, visiblePlayers]);

  const selectedOverlayPlayer = useMemo(
    () => playerRadarPolygons.find((poly: any) => String(poly.id) === selectedOverlayPlayerId) || null,
    [playerRadarPolygons, selectedOverlayPlayerId]
  );

  const orderedPlayerRadarPolygons = useMemo(() => {
    if (!selectedOverlayPlayerId) return playerRadarPolygons;
    const selected = playerRadarPolygons.find((poly: any) => String(poly.id) === selectedOverlayPlayerId);
    if (!selected) return playerRadarPolygons;
    const others = playerRadarPolygons.filter((poly: any) => String(poly.id) !== selectedOverlayPlayerId);
    return [...others, selected];
  }, [playerRadarPolygons, selectedOverlayPlayerId]);

  const selectedOverlayPlayerInfoRows = useMemo(() => {
    if (!selectedOverlayPlayer) return [];
    return availablePlayerMetrics.map((metric: string) => ({
      metric,
      display: formatFitnessDisplayValue(selectedOverlayPlayer.raw?.[metric], metric)
    }));
  }, [selectedOverlayPlayer, availablePlayerMetrics]);

  const singleMetric = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const value = String(singleMetricByDataset[ds] || "");
    if (availablePlayerMetrics.includes(value)) return value;
    return availablePlayerMetrics[0] || "";
  }, [selectedDatasetId, singleMetricByDataset, availablePlayerMetrics]);

  const singleMetricScope = useMemo(() => {
    const ds = String(selectedDatasetId || "");
    const value = String(singleMetricScopeByDataset[ds] || "selected");
    return value === "all" ? "all" : "selected";
  }, [selectedDatasetId, singleMetricScopeByDataset]);

  const singleMetricRows = useMemo(() => {
    if (!singleMetric) return [];
    const sourceRows = playerRows;
    return sourceRows
      .map((row: any) => {
        const value = parseNumericValue(row?.raw?.[singleMetric]);
        return {
          id: String(row.id),
          name: String(row.player || ""),
          value
        };
      })
      .filter((row: any) => row.value !== null)
      .sort((a: any, b: any) => Number(b.value) - Number(a.value));
  }, [singleMetric, playerRows]);

  const singleMetricColorMap = useMemo(() => {
    const map = new Map<string, string>(playerColorMap);
    let cursor = playerRows.length;
    singleMetricRows.forEach((row: any) => {
      const id = String(row.id);
      if (map.has(id)) return;
      map.set(id, PLAYER_OVERLAY_PALETTE[cursor % PLAYER_OVERLAY_PALETTE.length]);
      cursor += 1;
    });
    return map;
  }, [playerColorMap, singleMetricRows, playerRows.length]);

  const singleMetricMax = useMemo(() => {
    const sourceRows = singleMetricScope === "all" ? singleMetricRows : singleMetricRows.filter((row: any) => selectedPlayerIds.includes(String(row.id)));
    const effectiveRows = sourceRows.length > 0 ? sourceRows : singleMetricRows;
    let max = 0;
    effectiveRows.forEach((row: any) => {
      const abs = Math.abs(Number(row.value || 0));
      max = Math.max(max, abs);
    });
    return max > 0 ? max : 1;
  }, [singleMetricRows, singleMetricScope, selectedPlayerIds]);

  const onUploadClick = () => excelInputRef.current?.click();

  const onExcelChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage("");
    setError("");
    try {
      const currentDatasetId = String(selectedDatasetId || "");
      const prevSelectedMetricNames = (() => {
        const currentMetrics = Array.isArray(selectedPlayerMetricsByDataset[currentDatasetId]) ? selectedPlayerMetricsByDataset[currentDatasetId] : [];
        return new Set(currentMetrics.map((item: any) => String(item)));
      })();
      const prevSelectedPlayerNames = (() => {
        const currentIds = Array.isArray(selectedPlayersByDataset[currentDatasetId]) ? selectedPlayersByDataset[currentDatasetId] : [];
        const currentIdSet = new Set(currentIds.map((item: any) => String(item)));
        const names = new Set<string>();
        playerRows.forEach((row: any) => {
          if (currentIdSet.has(String(row.id))) names.add(String(row.player || "").trim());
        });
        return names;
      })();

      const backendReady = await verifyBackendHealth();
      if (!backendReady) {
        throw new Error("后端未就绪：请先启动 player-web/server/app.py 并确认 /api/health 可访问");
      }
      const res = await importFitnessExcel(file);
      setMessage(`导入成功：球队 ${res.teamCount}，球队指标 ${res.teamMetricCount}，球员 ${res.playerCount}，球员指标 ${res.playerMetricCount}`);
      const nextDatasetId = await loadDatasets(String(res.datasetId || ""));
      const detailRes = await fetchFitnessDataset(nextDatasetId);
      setDatasetDoc(detailRes.data || null);
      writeLocalStore(STORAGE_KEYS.fitnessSharedDatasetId, nextDatasetId);
      window.dispatchEvent(new Event("fitness-dataset-updated"));

      const nextPlayerRows = Array.isArray(detailRes?.data?.playerSheet?.players) ? detailRes.data.playerSheet.players : [];
      const nextPlayerMetrics = Array.isArray(detailRes?.data?.playerSheet?.numericColumns) ? detailRes.data.playerSheet.numericColumns : [];
      const inheritedMetricSelection = nextPlayerMetrics.filter((item: any) => prevSelectedMetricNames.has(String(item)));
      if (inheritedMetricSelection.length > 0) {
        setSelectedPlayerMetricsByDataset((prev: any) => ({ ...prev, [nextDatasetId]: inheritedMetricSelection }));
      }
      const inheritedPlayerIds = nextPlayerRows
        .filter((row: any) => prevSelectedPlayerNames.has(String(row?.player || "").trim()))
        .map((row: any) => String(row.id));
      if (inheritedPlayerIds.length > 0) {
        setSelectedPlayersByDataset((prev: any) => ({ ...prev, [nextDatasetId]: inheritedPlayerIds }));
      }
    } catch (err: any) {
      setError(`导入失败：${err.message}`);
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const handleDeleteDataset = async () => {
    if (!selectedDatasetId) return;
    if (!window.confirm("确认删除当前体能数据集吗？删除后不可恢复。")) return;
    setMessage("");
    setError("");
    try {
      const res = await deleteFitnessDataset(selectedDatasetId);
      const nextId = String(res.selectedDatasetId || "");
      const loadedId = await loadDatasets(nextId);
      await loadDatasetDetail(loadedId);
      setMessage("已删除当前体能数据集。");
    } catch (err: any) {
      setError(`删除失败：${err.message}`);
    }
  };

  const toggleTeamMetric = (metric: string) => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedTeamMetricsByDataset((prev: any) => {
      const current = Array.isArray(prev[ds]) ? prev[ds] : [];
      const next = current.includes(metric) ? current.filter((item: string) => item !== metric) : [...current, metric];
      return { ...prev, [ds]: next };
    });
  };

  const handleTeamMetricMaxChange = (metric: string, value: string) => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setTeamMetricMaxByDataset((prev: any) => {
      const dsMap = prev[ds] && typeof prev[ds] === "object" ? { ...prev[ds] } : {};
      const text = String(value || "").trim();
      if (!text) {
        delete dsMap[metric];
      } else {
        dsMap[metric] = value;
      }
      return { ...prev, [ds]: dsMap };
    });
  };

  const togglePlayerMetric = (metric: string) => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedPlayerMetricsByDataset((prev: any) => {
      const current = Array.isArray(prev[ds]) ? prev[ds] : [];
      const next = current.includes(metric) ? current.filter((item: string) => item !== metric) : [...current, metric];
      return { ...prev, [ds]: next };
    });
  };

  const togglePlayerVisible = (playerId: string) => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedPlayersByDataset((prev: any) => {
      const current = Array.isArray(prev[ds]) ? prev[ds] : [];
      const next = current.includes(playerId) ? current.filter((item: string) => item !== playerId) : [...current, playerId];
      return { ...prev, [ds]: next };
    });
  };

  const toggleOverlayPlayerSelection = (playerId: string) => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedOverlayPlayerByDataset((prev: any) => {
      const current = String(prev[ds] || "");
      return { ...prev, [ds]: current === playerId ? "" : playerId };
    });
  };

  const selectAllTeamMetrics = () => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedTeamMetricsByDataset((prev: any) => ({ ...prev, [ds]: availableTeamMetrics }));
  };

  const selectAllPlayerMetrics = () => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedPlayerMetricsByDataset((prev: any) => ({ ...prev, [ds]: availablePlayerMetrics }));
  };

  const selectAllPlayers = () => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedPlayersByDataset((prev: any) => ({ ...prev, [ds]: playerRows.map((row: any) => String(row.id)) }));
  };

  const clearTeamMetrics = () => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedTeamMetricsByDataset((prev: any) => ({ ...prev, [ds]: [] }));
  };

  const clearPlayerMetrics = () => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedPlayerMetricsByDataset((prev: any) => ({ ...prev, [ds]: [] }));
  };

  const clearPlayers = () => {
    const ds = String(selectedDatasetId || "");
    if (!ds) return;
    setSelectedPlayersByDataset((prev: any) => ({ ...prev, [ds]: [] }));
  };

  const exportTeamRadarSvg = () => {
    const svg = document.getElementById("fitness-team-radar-svg");
    if (!svg) {
      setError("未找到球队体能雷达图 SVG。");
      return;
    }
    const text = new XMLSerializer().serializeToString(svg);
    downloadFile("fitness_team_radar.svg", text, "image/svg+xml;charset=utf-8");
    setMessage("已导出球队体能雷达图 SVG。");
    setError("");
  };

  const exportTeamRadarPng = () => {
    const svg = document.getElementById("fitness-team-radar-svg");
    if (!svg) {
      setError("未找到球队体能雷达图 SVG。");
      return;
    }
    const text = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = TEAM_RADAR_WIDTH;
      canvas.height = TEAM_RADAR_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        setError("PNG 导出失败：无法创建画布。");
        return;
      }
      ctx.fillStyle = normalizeHexColor(teamRadarConfig.chartBackgroundColor) || "#f8f5ef";
      ctx.fillRect(0, 0, TEAM_RADAR_WIDTH, TEAM_RADAR_HEIGHT);
      ctx.drawImage(img, 0, 0, TEAM_RADAR_WIDTH, TEAM_RADAR_HEIGHT);
      canvas.toBlob((out) => {
        if (!out) {
          setError("PNG 导出失败。");
          return;
        }
        const outUrl = URL.createObjectURL(out);
        const a = document.createElement("a");
        a.href = outUrl;
        a.download = "fitness_team_radar.png";
        a.click();
        URL.revokeObjectURL(outUrl);
      }, "image/png");
      URL.revokeObjectURL(url);
      setMessage("已导出球队体能雷达图 PNG。");
      setError("");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("PNG 导出失败：图片渲染异常。");
    };
    img.src = url;
  };

  const backendOnline = backendHealth === "online";
  const titleFontSize = clampTitleFontSize(teamRadarConfig.titleFontSize);
  const pointRadius = clampPointRadius(teamRadarConfig.pointRadius);
  const homeColor = normalizeHexColor(teamRadarConfig.homeColor) || DEFAULT_TEAM_RADAR_CONFIG.homeColor;
  const awayColor = normalizeHexColor(teamRadarConfig.awayColor) || DEFAULT_TEAM_RADAR_CONFIG.awayColor;
  const chartBackgroundColor = normalizeHexColor(teamRadarConfig.chartBackgroundColor) || "#f8f5ef";
  const playerChartBackgroundColor = normalizeHexColor(playerRadarConfig.chartBackgroundColor) || "#f8f5ef";

  return (
    <section className="info-page">
      <div className="info-card fitness-page-shell">
        <h1>{isTeamView ? "两队体能雷达图" : "球员体能叠加雷达"}</h1>
        <p>上传 Excel 后仅解析前两个 Sheet：第1个用于两队体能雷达，第2个用于球员体能叠加雷达与单项比较。</p>

        <div className="fitness-top-bar">
          <div className="title-row">
            <label>导入数据集</label>
            <select value={selectedDatasetId} onChange={(e) => setSelectedDatasetId(e.target.value)} disabled={datasetOptions.length === 0}>
              {datasetOptions.length === 0 ? <option value="">暂无已导入体能数据集</option> : null}
              {datasetOptions.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          {isTeamView ? (
            <div className="btn-row">
              <button onClick={onUploadClick} disabled={importing || !backendOnline}>
                {importing ? "导入中..." : backendOnline ? "导入体能 Excel（前2个Sheet）" : "后端未连接"}
              </button>
              <button onClick={handleDeleteDataset} disabled={!selectedDatasetId || importing}>
                删除当前数据集
              </button>
              <input ref={excelInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden-file" onChange={onExcelChange} />
            </div>
          ) : (
            <p className="fitness-empty">数据上传入口在“体能数据分析 -&gt; 两队体能雷达图”页面，上传后本页自动同步。</p>
          )}
        </div>

        <div className="fitness-meta-row">
          <p>{`球队数：${Array.isArray(teamSheet?.teams) ? teamSheet.teams.length : 0}`}</p>
          <p>{`球队指标数：${Array.isArray(teamSheet?.numericColumns) ? teamSheet.numericColumns.length : 0}`}</p>
          <p>{`球员数：${Array.isArray(playerSheet?.players) ? playerSheet.players.length : 0}`}</p>
          <p>{`球员指标数：${Array.isArray(playerSheet?.numericColumns) ? playerSheet.numericColumns.length : 0}`}</p>
          <p>{`更新时间：${formatDateTime(datasetDoc?.updatedAt) || "-"}`}</p>
        </div>

        {!backendOnline ? <p className="msg err">导入已禁用：后端未连接（默认 http://127.0.0.1:8787）</p> : null}
        {message ? <p className="msg ok">{message}</p> : null}
        {error ? <p className="msg err">{error}</p> : null}

        <div className="fitness-layout">
          <div className="fitness-left-col">
            {isTeamView ? (
              <div className="fitness-card">
              <h2>两队体能雷达图（第1个Sheet）</h2>
              <p>{`对阵：${homeTeamDisplayName || "主队"} vs ${awayTeamDisplayName || "客队"}`}</p>

              <div className="match-radar-grid-2">
                <div className="title-row">
                  <label>主队颜色</label>
                  <input className="square-color-picker" type="color" value={homeColor} onChange={(e) => updateTeamRadarConfig({ homeColor: e.target.value })} />
                </div>
                <div className="title-row">
                  <label>客队颜色</label>
                  <input className="square-color-picker" type="color" value={awayColor} onChange={(e) => updateTeamRadarConfig({ awayColor: e.target.value })} />
                </div>
              </div>

              <div className="match-radar-grid-2">
                <div className="title-row">
                  <label>主标题</label>
                  <input value={teamRadarConfig.title} onChange={(e) => updateTeamRadarConfig({ title: e.target.value })} />
                </div>
                <div className="title-row">
                  <label>副标题</label>
                  <input value={teamRadarConfig.subtitle} onChange={(e) => updateTeamRadarConfig({ subtitle: e.target.value })} />
                </div>
              </div>

              <div className="match-radar-grid-2">
                <div className="title-row">
                  <label>主标题字号（20-64）</label>
                  <div className="match-size-control">
                    <input type="range" min="20" max="64" step="1" value={titleFontSize} onChange={(e) => updateTeamRadarConfig({ titleFontSize: e.target.value })} />
                    <input type="number" min="20" max="64" step="1" value={titleFontSize} onChange={(e) => updateTeamRadarConfig({ titleFontSize: e.target.value })} />
                  </div>
                </div>
                <div className="title-row">
                  <label>点大小（2-10）</label>
                  <div className="match-size-control">
                    <input type="range" min="2" max="10" step="1" value={pointRadius} onChange={(e) => updateTeamRadarConfig({ pointRadius: e.target.value })} />
                    <input type="number" min="2" max="10" step="1" value={pointRadius} onChange={(e) => updateTeamRadarConfig({ pointRadius: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="match-export-row">
                <div className="title-row match-bg-control">
                  <label>背景色</label>
                  <input className="square-color-picker" type="color" value={chartBackgroundColor} onChange={(e) => updateTeamRadarConfig({ chartBackgroundColor: e.target.value })} />
                </div>
                <button onClick={exportTeamRadarSvg} disabled={selectedTeamMetricRows.length === 0}>
                  导出 SVG
                </button>
                <button onClick={exportTeamRadarPng} disabled={selectedTeamMetricRows.length === 0}>
                  导出 PNG
                </button>
              </div>

              <div className="fitness-metric-actions">
                <div className="fitness-summary-row">
                  <p>{`已勾选球队指标：${selectedTeamMetrics.length}/${availableTeamMetrics.length}`}</p>
                  <div className="btn-row">
                    <button onClick={selectAllTeamMetrics} disabled={availableTeamMetrics.length === 0}>全选指标</button>
                    <button onClick={clearTeamMetrics} disabled={availableTeamMetrics.length === 0}>清空勾选</button>
                  </div>
                </div>
              </div>

              <div className="player-data-table-wrap fitness-table-wrap fitness-team-table-wrap">
                <table className="fitness-team-data-table">
                  <thead>
                    <tr>
                      <th>选</th>
                      <th>指标</th>
                      <th>{homeTeamDisplayName || "主队"}</th>
                      <th>{awayTeamDisplayName || "客队"}</th>
                      <th>雷达上限</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableTeamMetrics.length === 0 ? (
                      <tr>
                        <td colSpan={5}>暂无可用球队指标，请先导入包含两队数值数据的 Excel。</td>
                      </tr>
                    ) : null}
                    {teamMetricRows.map((row: any) => (
                      <tr key={row.column}>
                        <td>
                          <input type="checkbox" checked={row.selected} onChange={() => toggleTeamMetric(row.column)} />
                        </td>
                        <td>{row.metric}</td>
                        <td>{row.homeDisplay}</td>
                        <td>{row.awayDisplay}</td>
                        <td>
                          <input
                            className="fitness-max-input"
                            type="number"
                            min="0"
                            step="any"
                            value={row.manualMaxRaw}
                            placeholder={row.autoMaxDisplay}
                            onChange={(e) => handleTeamMetricMaxChange(row.column, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            ) : null}

            {isPlayerView ? (
              <div className="fitness-card">
              <h2>球员体能叠加雷达（第2个Sheet）</h2>

              <div className="match-radar-grid-2">
                <div className="title-row">
                  <label>主标题</label>
                  <input value={playerRadarConfig.title} onChange={(e) => updatePlayerRadarConfig({ title: e.target.value })} />
                </div>
                <div className="title-row">
                  <label>副标题</label>
                  <input value={playerRadarConfig.subtitle} onChange={(e) => updatePlayerRadarConfig({ subtitle: e.target.value })} />
                </div>
              </div>

              <div className="title-row">
                <label>背景色</label>
                <input className="square-color-picker" type="color" value={playerChartBackgroundColor} onChange={(e) => updatePlayerRadarConfig({ chartBackgroundColor: e.target.value })} />
              </div>

              <div className="fitness-metric-actions">
                <div className="fitness-summary-row">
                  <p>{`已勾选指标：${selectedPlayerMetrics.length}/${availablePlayerMetrics.length}`}</p>
                  <div className="btn-row">
                    <button onClick={selectAllPlayerMetrics} disabled={availablePlayerMetrics.length === 0}>全选指标</button>
                    <button onClick={clearPlayerMetrics} disabled={availablePlayerMetrics.length === 0}>清空指标</button>
                  </div>
                </div>
                <div className="fitness-summary-row">
                  <p>{`已勾选球员：${selectedPlayerIds.length}/${playerRows.length}`}</p>
                  <div className="btn-row">
                    <button onClick={selectAllPlayers} disabled={playerRows.length === 0}>全选球员</button>
                    <button onClick={clearPlayers} disabled={playerRows.length === 0}>清空球员</button>
                  </div>
                </div>
              </div>

              <div className="fitness-check-grid">
                {availablePlayerMetrics.map((metric: string) => (
                  <label key={metric} className="fitness-check-item">
                    <input type="checkbox" checked={selectedPlayerMetrics.includes(metric)} onChange={() => togglePlayerMetric(metric)} />
                    <span>{metric}</span>
                  </label>
                ))}
              </div>

              </div>
            ) : null}

            {isPlayerView ? (
              <div className="fitness-card">
              <h2>单项比较（第2个Sheet）</h2>
              <div className="match-radar-grid-2">
                <div className="title-row">
                  <label>选择指标</label>
                  <select
                    value={singleMetric}
                    onChange={(e) => {
                      const ds = String(selectedDatasetId || "");
                      if (!ds) return;
                      setSingleMetricByDataset((prev: any) => ({ ...prev, [ds]: e.target.value }));
                    }}
                  >
                    {availablePlayerMetrics.map((metric: string) => (
                      <option key={metric} value={metric}>
                        {metric}
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
                      setSingleMetricScopeByDataset((prev: any) => ({ ...prev, [ds]: e.target.value }));
                    }}
                  >
                    <option value="selected">仅勾选球员</option>
                    <option value="all">全部球员</option>
                  </select>
                </div>
              </div>

              <div className="fitness-bars-wrap">
                {singleMetricRows.length === 0 ? <p className="fitness-empty">暂无可用数据。</p> : null}
                {singleMetricRows.map((row: any) => {
                  const value = Number(row.value || 0);
                  const ratio = singleMetricMax > 0 ? Math.abs(value) / singleMetricMax : 0;
                  const color = singleMetricColorMap.get(String(row.id)) || "#7b7062";
                  const display = formatFitnessDisplayValue(row.value, singleMetric);
                  const checked = selectedPlayerIds.includes(String(row.id));
                  return (
                    <div className="fitness-bar-row" key={row.id}>
                      <div className="fitness-bar-check">
                        <input type="checkbox" checked={checked} onChange={() => togglePlayerVisible(String(row.id))} />
                      </div>
                      <div className="fitness-bar-name">{row.name}</div>
                      <div className="fitness-bar-track">
                        <div className="fitness-bar-fill" style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%`, background: color }} />
                      </div>
                      <div className="fitness-bar-value">{display}</div>
                    </div>
                  );
                })}
              </div>
              </div>
            ) : null}
          </div>

          <div className="fitness-right-col">
            {isTeamView ? (
              <div className="fitness-card fitness-chart-card overlay-radar-chart-card">
              <svg id="fitness-team-radar-svg" viewBox={`0 0 ${TEAM_RADAR_WIDTH} ${TEAM_RADAR_HEIGHT}`}>
                <rect x="0" y="0" width={TEAM_RADAR_WIDTH} height={TEAM_RADAR_HEIGHT} fill={chartBackgroundColor} />

                <text x={TEAM_RADAR_CENTER_X} y="48" textAnchor="middle" fontSize={titleFontSize} fontWeight="700" fill="#2f2a24">
                  {teamRadarConfig.title}
                </text>
                <text x={TEAM_RADAR_CENTER_X} y="80" textAnchor="middle" fontSize="16" fill="#5f5850">
                  {teamRadarConfig.subtitle}
                </text>

                {homeTeamLogoSrc ? (
                  <image x={TEAM_RADAR_CENTER_X - 328} y="56" width="88" height="88" href={homeTeamLogoSrc} preserveAspectRatio="xMidYMid meet" />
                ) : (
                  <g>
                    <circle cx={TEAM_RADAR_CENTER_X - 284} cy="100" r="36" fill="#f6efe3" stroke="#d2c6b6" strokeWidth="2" />
                    <text x={TEAM_RADAR_CENTER_X - 284} y="108" textAnchor="middle" fontSize="26" fontWeight="700" fill={homeColor}>
                      {String(homeTeamDisplayName || "主队").slice(0, 1).toUpperCase()}
                    </text>
                  </g>
                )}
                {awayTeamLogoSrc ? (
                  <image x={TEAM_RADAR_CENTER_X + 240} y="56" width="88" height="88" href={awayTeamLogoSrc} preserveAspectRatio="xMidYMid meet" />
                ) : (
                  <g>
                    <circle cx={TEAM_RADAR_CENTER_X + 284} cy="100" r="36" fill="#f6efe3" stroke="#d2c6b6" strokeWidth="2" />
                    <text x={TEAM_RADAR_CENTER_X + 284} y="108" textAnchor="middle" fontSize="26" fontWeight="700" fill={awayColor}>
                      {String(awayTeamDisplayName || "客队").slice(0, 1).toUpperCase()}
                    </text>
                  </g>
                )}

                <text x={TEAM_RADAR_CENTER_X - 284} y="184" textAnchor="middle" fontSize="21" fontWeight="700" fill={homeColor}>
                  {homeTeamDisplayName || "主队"}
                </text>
                <text x={TEAM_RADAR_CENTER_X + 284} y="184" textAnchor="middle" fontSize="21" fontWeight="700" fill={awayColor}>
                  {awayTeamDisplayName || "客队"}
                </text>

                {[20, 40, 60, 80, 100].map((tick) => (
                  <circle
                    key={tick}
                    cx={TEAM_RADAR_CENTER_X}
                    cy={TEAM_RADAR_CENTER_Y}
                    r={(tick / 100) * TEAM_RADAR_MAX_RADIUS}
                    fill="none"
                    stroke="#d9cfbf"
                    strokeDasharray="4 6"
                  />
                ))}

                {teamAxisPoints.map((pt: any, idx: number) => (
                  <line key={idx} x1={TEAM_RADAR_CENTER_X} y1={TEAM_RADAR_CENTER_Y} x2={pt.x} y2={pt.y} stroke="#c8bfb2" />
                ))}

                {teamAwayPath ? <path d={teamAwayPath} fill={colorToAlpha(awayColor, 0.2)} stroke={awayColor} strokeWidth="3" /> : null}
                {teamHomePath ? <path d={teamHomePath} fill={colorToAlpha(homeColor, 0.2)} stroke={homeColor} strokeWidth="3" /> : null}

                {teamAwayPoints.map((pt: any, idx: number) => (
                  <circle key={`away-${idx}`} cx={pt.x} cy={pt.y} r={pointRadius} fill={awayColor} />
                ))}
                {teamHomePoints.map((pt: any, idx: number) => (
                  <circle key={`home-${idx}`} cx={pt.x} cy={pt.y} r={pointRadius} fill={homeColor} />
                ))}

                {selectedTeamMetricRows.map((row: any, idx: number) => {
                  const labelPt = pointAt(
                    TEAM_RADAR_CENTER_X,
                    TEAM_RADAR_CENTER_Y,
                    TEAM_RADAR_MAX_RADIUS + 38,
                    -Math.PI / 2 + ((Math.PI * 2) / selectedTeamMetricRows.length) * idx
                  );
                  return (
                    <g key={`team-label-${row.column}`}>
                      <text x={labelPt.x} y={labelPt.y} textAnchor="middle" fontSize="20" fontWeight="700" fill="#342f29">
                        {row.metric}
                      </text>
                      <text x={labelPt.x} y={labelPt.y + 22} textAnchor="middle" fontSize="16" fontWeight="700">
                        <tspan fill={homeColor}>{row.homeDisplay || "-"}</tspan>
                        <tspan fill="#2f2a24">/</tspan>
                        <tspan fill={awayColor}>{row.awayDisplay || "-"}</tspan>
                      </text>
                    </g>
                  );
                })}
              </svg>
              </div>
            ) : null}

            {isPlayerView ? (
              <div className="fitness-card fitness-chart-card overlay-radar-chart-card">
              <svg id="fitness-player-radar-svg" viewBox={`0 ${PLAYER_RADAR_VIEWBOX_Y} ${PLAYER_RADAR_WIDTH} ${PLAYER_RADAR_VIEWBOX_HEIGHT}`}>
                <rect x="0" y="0" width={PLAYER_RADAR_WIDTH} height={PLAYER_RADAR_HEIGHT} fill={playerChartBackgroundColor} />

                <text x={PLAYER_RADAR_CENTER_X} y="48" textAnchor="middle" fontSize="34" fontWeight="700" fill="#2f2a24">
                  {playerRadarConfig.title}
                </text>
                <text x={PLAYER_RADAR_CENTER_X} y="80" textAnchor="middle" fontSize="16" fill="#5f5850">
                  {playerRadarConfig.subtitle}
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

                {playerAxisPoints.map((pt: any, idx: number) => (
                  <line key={idx} x1={PLAYER_RADAR_CENTER_X} y1={PLAYER_RADAR_CENTER_Y} x2={pt.x} y2={pt.y} stroke="#c8bfb2" />
                ))}

                {orderedPlayerRadarPolygons.map((poly: any) => (
                  <g key={poly.id}>
                    <path
                      className={`fitness-overlay-polygon${selectedOverlayPlayerId === poly.id ? " is-selected" : ""}`}
                      d={poly.path}
                      fill={colorToAlpha(poly.color, selectedOverlayPlayerId === poly.id ? 0.7 : 0.1)}
                      stroke={poly.color}
                      strokeWidth={selectedOverlayPlayerId === poly.id ? "3.5" : "2"}
                      onClick={() => toggleOverlayPlayerSelection(poly.id)}
                    />
                    {poly.points.map((pt: any, idx: number) => (
                      <circle key={`${poly.id}-${idx}`} cx={pt.x} cy={pt.y} r="4" fill={poly.color} />
                    ))}
                  </g>
                ))}

                {playerRadarMetrics.map((metric: string, idx: number) => {
                  const labelPt = pointAt(
                    PLAYER_RADAR_CENTER_X,
                    PLAYER_RADAR_CENTER_Y,
                    PLAYER_RADAR_MAX_RADIUS + 34,
                    -Math.PI / 2 + ((Math.PI * 2) / playerRadarMetrics.length) * idx
                  );
                  return (
                    <text key={metric} x={labelPt.x} y={labelPt.y} textAnchor="middle" fontSize="18" fontWeight="700" fill="#342f29">
                      {metric}
                    </text>
                  );
                })}

                <g>
                  {playerRadarPolygons.map((poly: any, idx: number) => (
                    <g key={`legend-${poly.id}`} transform={`translate(28 ${120 + idx * 24})`} className="fitness-overlay-legend-item" onClick={() => toggleOverlayPlayerSelection(poly.id)}>
                      <rect x="0" y="-12" width="12" height="12" fill={poly.color} />
                      <text x="18" y="-2" fontSize="14" fill={selectedOverlayPlayerId === poly.id ? "#111" : "#2f2a24"} fontWeight={selectedOverlayPlayerId === poly.id ? "700" : "400"}>
                        {poly.name}
                      </text>
                    </g>
                  ))}
                </g>
              </svg>
              <div className="fitness-player-detail-card">
                {selectedOverlayPlayer ? (
                  <>
                    <h3>{`已选球员：${selectedOverlayPlayer.name}`}</h3>
                    <div className="fitness-player-detail-grid">
                      {selectedOverlayPlayerInfoRows.map((row: any) => (
                        <div key={row.metric} className="fitness-player-detail-row">
                          <span className="fitness-player-detail-metric">{row.metric}</span>
                          <span className="fitness-player-detail-value">{row.display}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="fitness-empty">点击图中任意球员封闭区域可查看该球员全部指标。</p>
                )}
              </div>
              {selectedPlayerMetrics.length < 3 ? <p className="fitness-empty">提示：雷达图建议至少勾选 3 个指标。</p> : null}
              </div>
            ) : null}
          </div>
        </div>

        {loading ? <p>加载中...</p> : null}
      </div>
    </section>
  );
}

export default FitnessAnalysisPage;
