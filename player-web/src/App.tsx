import React, { useEffect, useMemo, useRef, useState } from "react";
import { checkHealth, deletePlayerDataset, fetchAuthStatus, fetchPlayerById, fetchPlayerDatasets, fetchPlayerList, fetchState, getApiBaseLabel, importPlayerExcel, loginSharedSession, logoutSharedSession, migrateFromLocal, saveState } from "./api/storageClient";
import RadarEditorPage from "./components/RadarEditorPage";
import SharedLoginPage from "./components/SharedLoginPage";
import TopNav from "./components/TopNav";
import useScatterPlotState from "./hooks/useScatterPlotState";
import {
  computeTierFromValue,
  formatPlayerDataColumnLabel,
  formatRadarTitlePlayerName,
  getMetricDisplayNameFromColumn,
  inferMetricGroupAndOrder,
  normalizeExportSequenceMap,
  normalizePersistedState,
  normalizeMatchMetricPresets,
  normalizePlayerMetricPresets,
  normalizeSelectionMap,
  normalizeSnapshot,
  parseCsv,
  readStorage,
  recomputeRowsTier,
  resequenceSubOrder,
  resolveImportedAge,
  resolveImportedMinutes,
  resolveImportedPosition,
  sanitizeExportFilenamePart,
  toCsv,
  writeStorage,
  writeStorageWithResult
} from "./app/radar/radarState";
import { buildImportedGroupOrderMap, normalizeImportedGroupName } from "./utils/importGroupOrder";
import { getMatchProjectMappingRows, saveMatchProjectMappingRows } from "./utils/matchProjectMappingStore";
import { getNameMappingRows, getNameMappingRowsByEnglish, normalizePlayerName, saveNameMappingRows } from "./utils/nameMappingStore";
import { subscribeMappingStoreChanged } from "./utils/mappingSync";
import { getProjectGroupByColumn, getProjectMappingRows, saveProjectMappingRows } from "./utils/projectMappingStore";
import { computeGroupLabelLayouts } from "./utils/radarLabelLayout";
import { getTeamMappingRows, saveTeamMappingRows } from "./utils/teamMappingStore";
import { formatDateTime } from "./utils/timeFormat";
import { compactPresetsForLocalStorage, compactSnapshotForLocalStorage, isQuotaExceededResult } from "./utils/localStorageQuota";
import {
  DEFAULT_CENTER_IMAGE,
  DEFAULT_CHART_STYLE,
  DEFAULT_CORNER_IMAGE,
  DEFAULT_META,
  DEFAULT_TEXT_STYLE,
  INITIAL_ROWS,
  REORDER_MODE_ORDER,
  STORAGE_KEYS,
  CENTER_X,
  CENTER_Y,
  INNER_RING,
  MAX_RADIAL_LENGTH,
  METRIC_LABEL_RADIUS
} from "./app/constants";
import { isAppPageKey, type AppPageKey } from "./app/pageRegistry";
import { renderActivePage } from "./app/renderActivePage";
function App() {
  const apiBaseLabel = getApiBaseLabel();
  const [activePage, setActivePage] = useState<AppPageKey>("radar");
  const [title, setTitle] = useState("Player Radar (Template Mode)");
  const [subtitle, setSubtitle] = useState("Input metric CSV and export image");
  const [rows, setRows] = useState(() => recomputeRowsTier(INITIAL_ROWS));
  const [rowReorderMode, setRowReorderMode] = useState(REORDER_MODE_ORDER);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(DEFAULT_META);
  const [textStyle, setTextStyle] = useState(DEFAULT_TEXT_STYLE);
  const [chartStyle, setChartStyle] = useState(DEFAULT_CHART_STYLE);
  const [centerImage, setCenterImage] = useState(DEFAULT_CENTER_IMAGE);
  const [cornerImage, setCornerImage] = useState(DEFAULT_CORNER_IMAGE);
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState("draft");
  const [saveName, setSaveName] = useState("");
  const [titlePanelOpen, setTitlePanelOpen] = useState(true);
  const [fontPanelOpen, setFontPanelOpen] = useState(true);
  const [imagePanelOpen, setImagePanelOpen] = useState(true);
  const [dataTablePanelOpen, setDataTablePanelOpen] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [authStatus, setAuthStatus] = useState<"checking" | "anonymous" | "authenticated">("checking");
  const [authUsername, setAuthUsername] = useState("player");
  const [loginUsername, setLoginUsername] = useState("player");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [playerDataMeta, setPlayerDataMeta] = useState({ playerCount: 0, updatedAt: "", numericColumns: [] });
  const [datasetOptions, setDatasetOptions] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [playerOptions, setPlayerOptions] = useState([]);
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedPlayerDetail, setSelectedPlayerDetail] = useState(null);
  const [playerDataLoading, setPlayerDataLoading] = useState(false);
  const [playerDataImporting, setPlayerDataImporting] = useState(false);
  const [playerDataMessage, setPlayerDataMessage] = useState("");
  const [playerDataError, setPlayerDataError] = useState("");
  const [backendHealth, setBackendHealth] = useState("checking");
  const [playerDetailReloadTick, setPlayerDetailReloadTick] = useState(0);
  const [metricSelectionsByDataset, setMetricSelectionsByDataset] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.metricSelectionsByDataset, {});
    return raw && typeof raw === "object" ? raw : {};
  });
  const [playerMetricPresets, setPlayerMetricPresets] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.playerMetricPresets, readStorage(STORAGE_KEYS.legacyPlayerMetricPresetsByDataset, []));
    return normalizePlayerMetricPresets(raw);
  });
  const [matchMetricPresets, setMatchMetricPresets] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.matchMetricPresets, []);
    return normalizeMatchMetricPresets(raw);
  });
  const [selectedPlayerMetricPresetByDataset, setSelectedPlayerMetricPresetByDataset] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.selectedPlayerMetricPresetByDataset, {});
    return normalizeSelectionMap(raw);
  });
  const [selectedMatchMetricPresetByDataset, setSelectedMatchMetricPresetByDataset] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.selectedMatchMetricPresetByDataset, {});
    return normalizeSelectionMap(raw);
  });
  const [playerSearchByDataset, setPlayerSearchByDataset] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.playerSearchByDataset, {});
    return raw && typeof raw === "object" ? raw : {};
  });
  const [selectedPlayerByDataset, setSelectedPlayerByDataset] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.selectedPlayerByDataset, {});
    return raw && typeof raw === "object" ? raw : {};
  });
  const [radarPngExportSequenceByVersion, setRadarPngExportSequenceByVersion] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.radarPngExportSequenceByVersion, {});
    return normalizeExportSequenceMap(raw);
  });
  const [projectMappingRows, setProjectMappingRows] = useState(() => getProjectMappingRows());
  const [matchProjectMappingRows, setMatchProjectMappingRows] = useState(() => getMatchProjectMappingRows());
  const [nameMappingRows, setNameMappingRows] = useState(() => getNameMappingRows());
  const [teamMappingRows, setTeamMappingRows] = useState(() => getTeamMappingRows());
  const [mappingRevision, setMappingRevision] = useState(0);
  const [, setStorageStatus] = useState("connecting");
  const fileInputRef = useRef(null);
  const playerExcelInputRef = useRef(null);
  const centerImageInputRef = useRef(null);
  const cornerImageInputRef = useRef(null);
  const saveTimerRef = useRef(null);
  const saveSeqRef = useRef(0);
  const playerDetailReqSeqRef = useRef(0);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (Number(a.order) !== Number(b.order)) return Number(a.order) - Number(b.order);
      if (a.group !== b.group) return a.group.localeCompare(b.group, "en-US");
      if (Number(a.subOrder) !== Number(b.subOrder)) return Number(a.subOrder) - Number(b.subOrder);
      return a.metric.localeCompare(b.metric, "en-US");
    });
  }, [rows]);

  const filteredPlayerOptions = useMemo(() => {
    const keyword = playerSearchQuery.trim().toLowerCase();
    if (!keyword) return playerOptions;
    return playerOptions.filter((item) => String(item.player || "").toLowerCase().includes(keyword));
  }, [playerOptions, playerSearchQuery]);

  const selectedMetricColumns = useMemo(() => {
    if (!selectedDatasetId) return [];
    const numericColumns = Array.isArray(playerDataMeta.numericColumns) ? playerDataMeta.numericColumns : [];
    const selected = Array.isArray(metricSelectionsByDataset[selectedDatasetId]) ? metricSelectionsByDataset[selectedDatasetId] : [];
    return selected.filter((col) => numericColumns.includes(col));
  }, [selectedDatasetId, metricSelectionsByDataset, playerDataMeta.numericColumns]);

  const playerMetricPresetOptions = useMemo(() => {
    return playerMetricPresets;
  }, [playerMetricPresets]);

  const selectedPlayerMetricPresetId = useMemo(() => {
    if (!selectedDatasetId) return "";
    const presetId = String(selectedPlayerMetricPresetByDataset[selectedDatasetId] || "").trim();
    if (!presetId) return "";
    return playerMetricPresetOptions.some((item) => item.id === presetId) ? presetId : "";
  }, [selectedDatasetId, selectedPlayerMetricPresetByDataset, playerMetricPresetOptions]);

  const selectedPlayerName = useMemo(() => {
    if (selectedPlayerDetail?.player) return String(selectedPlayerDetail.player);
    const found = playerOptions.find((item) => item.id === selectedPlayerId);
    return found?.player || "";
  }, [selectedPlayerDetail, playerOptions, selectedPlayerId]);

  const stats = useMemo(() => {
    const total = sortedRows.length || 1;
    const step = (Math.PI * 2) / total;
    const barWidth = step * 0.92;
    const startAngle = -Math.PI / 2;

    const groupStarts = [];
    let lastGroup = "";
    sortedRows.forEach((row, i) => {
      if (row.group !== lastGroup) {
        groupStarts.push({ index: i, group: row.group });
        lastGroup = row.group;
      }
    });

    return { total, step, barWidth, startAngle, groupStarts };
  }, [sortedRows]);

  const groupLabelLayouts = useMemo(() => {
    return computeGroupLabelLayouts({
      sortedRows,
      stats,
      textStyle,
      chartStyle,
      centerX: CENTER_X,
      centerY: CENTER_Y,
      innerRing: INNER_RING,
      maxRadialLength: MAX_RADIAL_LENGTH,
      metricLabelRadius: METRIC_LABEL_RADIUS
    });
  }, [
    sortedRows,
    stats,
    textStyle.metricSize,
    textStyle.groupSize,
    textStyle.fontFamily,
    chartStyle.groupSeparatorLength,
    chartStyle.groupSeparatorOffset,
    chartStyle.groupLabelRadius,
    chartStyle.groupLabelOffsetX,
    chartStyle.groupLabelOffsetY
  ]);

  const updateCell = (index, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      const cloned = { ...next[index] };
      if (field === "value") {
        const num = Number(value);
        cloned[field] = Number.isNaN(num) ? 0 : Math.min(100, num);
        cloned.tier = computeTierFromValue(cloned[field]);
      } else if (field === "order") {
        const num = Number(value);
        cloned[field] = Number.isNaN(num) ? 1 : Math.floor(num);
      } else if (field === "subOrder") {
        const num = Number(value);
        cloned[field] = Number.isNaN(num) ? 1 : Math.max(1, Math.floor(num));
      } else {
        cloned[field] = value;
      }
      next[index] = cloned;
      return next;
    });
    setError("");
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        metric: "new_metric",
        group: "new_group",
        value: 50,
        per90: "",
        tier: computeTierFromValue(50),
        order: 1,
        subOrder: 1,
        color: ""
      }
    ]);
  };

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const moveRow = (index, direction) => {
    setRows((prev) => {
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      let next = rowReorderMode === REORDER_MODE_ORDER ? prev.map((row) => ({ ...row })) : [...prev];

      if (rowReorderMode === REORDER_MODE_ORDER) {
        const sourceOrder = Number(next[index].order);
        const targetOrder = Number(next[target].order);
        const hasInvalidOrder = !Number.isFinite(sourceOrder) || !Number.isFinite(targetOrder);
        if (hasInvalidOrder) {
          next = next.map((row, i) => ({ ...row, order: i + 1 }));
        }
        const normalizedSourceOrder = Math.floor(Number(next[index].order));
        const normalizedTargetOrder = Math.floor(Number(next[target].order));
        next[index].order = normalizedTargetOrder;
        next[target].order = normalizedSourceOrder;
      }

      [next[index], next[target]] = [next[target], next[index]];
      return resequenceSubOrder(next);
    });
    setError("");
  };

  const downloadFile = (filename, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    downloadFile("player_chart_data.csv", toCsv(rows), "text/csv;charset=utf-8");
    setMessage("已下载当前数据 CSV");
    setError("");
  };

  const importCsvText = (csvText) => {
    const parsed = parseCsv(csvText);
    if (parsed.error) {
      setError(parsed.error);
      setMessage("");
      return;
    }
    setRows(recomputeRowsTier(parsed.rows));
    setMessage(`CSV 导入成功，共 ${parsed.rows.length} 行`);
    setError("");
  };

  const onUploadClick = () => fileInputRef.current?.click();

  const onPlayerExcelUploadClick = () => playerExcelInputRef.current?.click();

  const onCsvFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importCsvText(text);
    event.target.value = "";
  };

  const loadDatasets = async (preferredDatasetId = "") => {
    setPlayerDataError("");
    try {
      const res = await fetchPlayerDatasets();
      const datasets = Array.isArray(res.datasets) ? res.datasets : [];
      setDatasetOptions(datasets);
      if (datasets.length === 0) {
        setSelectedDatasetId("");
        return "";
      }
      const serverSelected = String(res.selectedDatasetId || "");
      const firstId = String(datasets[0]?.id || "");
      const fallbackId = serverSelected || firstId;
      const matchedPreferred = preferredDatasetId && datasets.some((d) => d.id === preferredDatasetId);
      const nextId = matchedPreferred ? preferredDatasetId : fallbackId;
      setSelectedDatasetId(nextId);
      return nextId;
    } catch (err) {
      setPlayerDataError(`数据集读取失败：${err.message}`);
      setDatasetOptions([]);
      setSelectedDatasetId("");
      return "";
    }
  };

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

  const {
    scatterConfig,
    updateScatterConfig,
    scatterDataLoading,
    scatterDataError,
    scatterDatasetDoc
  } = useScatterPlotState({
    activePage,
    selectedDatasetId,
    loadDatasets,
    isHydrated,
    readStorage,
    writeStorage,
    storageKey: STORAGE_KEYS.scatterConfigByDataset
  });

  const loadPlayerList = async (datasetId, preferredPlayerId = "") => {
    setPlayerDataLoading(true);
    setPlayerDataError("");
    try {
      if (!datasetId) {
        setPlayerOptions([]);
        setSelectedPlayerId("");
        setSelectedPlayerDetail(null);
        setPlayerDataMeta({ playerCount: 0, updatedAt: "", numericColumns: [] });
        return;
      }
      const res = await fetchPlayerList(datasetId);
      const options = Array.isArray(res.players) ? res.players : [];
      setPlayerOptions(options);
      setPlayerDataMeta({
        playerCount: Number(res.playerCount || options.length),
        updatedAt: res.updatedAt || "",
        numericColumns: Array.isArray(res.numericColumns) ? res.numericColumns : []
      });
      if (options.length === 0) {
        setSelectedPlayerId("");
        setSelectedPlayerDetail(null);
        setPlayerDetailReloadTick((n) => n + 1);
        return;
      }
      const hasPreferred = preferredPlayerId && options.some((item) => item.id === preferredPlayerId);
      const nextId = hasPreferred ? preferredPlayerId : options[0].id;
      if (nextId !== selectedPlayerId) {
        setSelectedPlayerId(nextId);
      } else {
        setPlayerDetailReloadTick((n) => n + 1);
      }
    } catch (err) {
      setPlayerDataError(`球员数据读取失败：${err.message}`);
      setPlayerOptions([]);
      setSelectedPlayerId("");
      setSelectedPlayerDetail(null);
    } finally {
      setPlayerDataLoading(false);
    }
  };

  const onPlayerExcelChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPlayerDataImporting(true);
    setPlayerDataMessage("");
    setPlayerDataError("");
    try {
      const backendReady = await verifyBackendHealth();
      if (!backendReady) {
        throw new Error("后端未就绪：请先启动 player-web/server/app.py 并确认 /api/health 可访问");
      }
      const res = await importPlayerExcel(file);
      setPlayerDataMessage(`导入成功：${res.playerCount} 名球员，${res.numericColumnCount} 个数值列`);
      const nextDatasetId = await loadDatasets(String(res.datasetId || ""));
      await loadPlayerList(nextDatasetId, "");
    } catch (err) {
      setPlayerDataError(`导入失败：${err.message}`);
    } finally {
      setPlayerDataImporting(false);
      event.target.value = "";
    }
  };

  const handleDeleteCurrentDataset = async () => {
    if (!selectedDatasetId) return;
    if (!window.confirm("确认删除当前导入数据集吗？删除后不可恢复。")) return;
    const deletingDatasetId = selectedDatasetId;
    setPlayerDataError("");
    setPlayerDataMessage("");
    try {
      const res = await deletePlayerDataset(selectedDatasetId);
      const next = String(res.selectedDatasetId || "");
      setMetricSelectionsByDataset((prev) => {
        const nextMap = { ...prev };
        delete nextMap[deletingDatasetId];
        return nextMap;
      });
      setSelectedPlayerMetricPresetByDataset((prev) => {
        const nextMap = { ...prev };
        delete nextMap[deletingDatasetId];
        return nextMap;
      });
      setPlayerSearchByDataset((prev) => {
        const nextMap = { ...prev };
        delete nextMap[deletingDatasetId];
        return nextMap;
      });
      setSelectedPlayerByDataset((prev) => {
        const nextMap = { ...prev };
        delete nextMap[deletingDatasetId];
        return nextMap;
      });
      await loadDatasets(next);
      await loadPlayerList(next, "");
      setPlayerDataMessage("已删除当前数据集。");
    } catch (err) {
      setPlayerDataError(`删除数据集失败：${err.message}`);
    }
  };

  const handleToggleMetricColumn = (column) => {
    if (!selectedDatasetId) return;
    const numericColumns = Array.isArray(playerDataMeta.numericColumns) ? playerDataMeta.numericColumns : [];
    if (!numericColumns.includes(column)) return;
    setSelectedPlayerMetricPresetByDataset((prev) => {
      const nextMap = { ...prev };
      delete nextMap[selectedDatasetId];
      return nextMap;
    });
    setMetricSelectionsByDataset((prev) => {
      const current = Array.isArray(prev[selectedDatasetId]) ? prev[selectedDatasetId] : [];
      const next = current.includes(column) ? current.filter((item) => item !== column) : [...current, column];
      return { ...prev, [selectedDatasetId]: next };
    });
  };

  const handleSelectAllMetricColumns = () => {
    if (!selectedDatasetId) return;
    const numericColumns = Array.isArray(playerDataMeta.numericColumns) ? playerDataMeta.numericColumns : [];
    setSelectedPlayerMetricPresetByDataset((prev) => {
      const nextMap = { ...prev };
      delete nextMap[selectedDatasetId];
      return nextMap;
    });
    setMetricSelectionsByDataset((prev) => ({ ...prev, [selectedDatasetId]: numericColumns }));
  };

  const handleClearMetricColumns = () => {
    if (!selectedDatasetId) return;
    setSelectedPlayerMetricPresetByDataset((prev) => {
      const nextMap = { ...prev };
      delete nextMap[selectedDatasetId];
      return nextMap;
    });
    setMetricSelectionsByDataset((prev) => ({ ...prev, [selectedDatasetId]: [] }));
  };

  const applyPlayerMetricPreset = (presetId) => {
    if (!selectedDatasetId) return;
    setSelectedPlayerMetricPresetByDataset((prev) => {
      const next = { ...prev };
      if (presetId) {
        next[selectedDatasetId] = presetId;
      } else {
        delete next[selectedDatasetId];
      }
      return next;
    });

    if (!presetId) {
      setPlayerDataMessage("已取消指标预设选择。");
      setPlayerDataError("");
      return;
    }

    const found = playerMetricPresetOptions.find((item) => item.id === presetId);
    if (!found) {
      setPlayerDataError("未找到该指标预设。");
      setPlayerDataMessage("");
      return;
    }

    const numericColumns = Array.isArray(playerDataMeta.numericColumns) ? playerDataMeta.numericColumns : [];
    const validColumns = found.columns.filter((column) => numericColumns.includes(column));
    if (validColumns.length === 0) {
      setPlayerDataError("该预设在当前数据集没有可用指标，未覆盖当前勾选。");
      setPlayerDataMessage("");
      return;
    }

    setMetricSelectionsByDataset((prev) => ({ ...prev, [selectedDatasetId]: validColumns }));
    const skippedCount = found.columns.length - validColumns.length;
    setPlayerDataMessage(skippedCount > 0 ? `已应用预设：${found.name}（忽略 ${skippedCount} 个失效指标）` : `已应用预设：${found.name}`);
    setPlayerDataError("");
  };

  const handleSavePlayerMetricPreset = () => {
    if (!selectedDatasetId) {
      setPlayerDataError("请先选择数据集。");
      setPlayerDataMessage("");
      return;
    }
    if (selectedMetricColumns.length === 0) {
      setPlayerDataError("请先勾选至少一个指标后再保存预设。");
      setPlayerDataMessage("");
      return;
    }
    const input = window.prompt("请输入指标预设名称：", "");
    if (input === null) return;
    const name = input.trim();
    if (!name) {
      setPlayerDataError("预设名称不能为空。");
      setPlayerDataMessage("");
      return;
    }

    const now = new Date().toISOString();
    const newPreset = {
      id: `player_metric_preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      columns: selectedMetricColumns,
      createdAt: now,
      updatedAt: now
    };
    setPlayerMetricPresets((prev) => [newPreset, ...prev]);
    setSelectedPlayerMetricPresetByDataset((prev) => ({ ...prev, [selectedDatasetId]: newPreset.id }));
    setPlayerDataMessage(`已保存指标预设：${name}`);
    setPlayerDataError("");
  };

  const handleRenamePlayerMetricPreset = () => {
    if (!selectedDatasetId || !selectedPlayerMetricPresetId) {
      setPlayerDataError("请先选择一个指标预设。");
      setPlayerDataMessage("");
      return;
    }
    const found = playerMetricPresetOptions.find((item) => item.id === selectedPlayerMetricPresetId);
    if (!found) {
      setPlayerDataError("未找到该指标预设。");
      setPlayerDataMessage("");
      return;
    }
    const input = window.prompt("请输入新的预设名称：", found.name);
    if (input === null) return;
    const nextName = input.trim();
    if (!nextName) {
      setPlayerDataError("预设名称不能为空。");
      setPlayerDataMessage("");
      return;
    }

    setPlayerMetricPresets((prev) =>
      prev
        .map((item) => (item.id === found.id ? { ...item, name: nextName, updatedAt: new Date().toISOString() } : item))
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    );
    setPlayerDataMessage(`已重命名指标预设：${nextName}`);
    setPlayerDataError("");
  };

  const handleDeletePlayerMetricPreset = () => {
    if (!selectedDatasetId || !selectedPlayerMetricPresetId) {
      setPlayerDataError("请先选择一个指标预设。");
      setPlayerDataMessage("");
      return;
    }
    const found = playerMetricPresetOptions.find((item) => item.id === selectedPlayerMetricPresetId);
    if (!found) {
      setPlayerDataError("未找到该指标预设。");
      setPlayerDataMessage("");
      return;
    }
    if (!window.confirm(`确认删除指标预设「${found.name}」吗？此操作不可撤销。`)) return;

    setPlayerMetricPresets((prev) => prev.filter((item) => item.id !== found.id));
    setSelectedPlayerMetricPresetByDataset((prev) =>
      Object.entries(prev).reduce((acc, [datasetId, presetId]) => {
        if (presetId !== found.id) acc[datasetId] = presetId;
        return acc;
      }, {} as Record<string, string>)
    );
    setPlayerDataMessage(`已删除指标预设：${found.name}`);
    setPlayerDataError("");
  };

  const handleImportSelectedMetricsToRadar = () => {
    if (!selectedPlayerDetail || !Array.isArray(selectedPlayerDetail.columns) || selectedPlayerDetail.columns.length === 0) {
      setPlayerDataError("请先选择球员并等待详情加载完成。");
      return;
    }
    if (selectedMetricColumns.length === 0) {
      setPlayerDataError("请先勾选至少一个指标列。");
      return;
    }

    const detailMap = new Map(selectedPlayerDetail.columns.map((item) => [String(item.column || ""), item]));
    const importedRows = selectedMetricColumns
      .map((column, index) => {
        const detail = detailMap.get(column);
        if (!detail) return null;
        const percentile = Number(detail.percentile);
        if (!Number.isFinite(percentile)) return null;
        const value = Math.max(0, Math.min(100, Number(percentile.toFixed(2))));
        const metric = getMetricDisplayNameFromColumn(column);
        const mappedGroup = getProjectGroupByColumn(column);
        const fallback = inferMetricGroupAndOrder(column, metric);
        const group = normalizeImportedGroupName(mappedGroup || fallback.group);
        return {
          metric,
          value,
          group,
          order: 0,
          subOrder: 1,
          per90: String(detail.value ?? ""),
          tier: computeTierFromValue(value),
          color: "",
          _index: index
        };
      })
      .filter(Boolean);

    if (importedRows.length === 0) {
      setPlayerDataError("当前勾选列没有可用百分比数据，请更换球员或勾选项。");
      return;
    }

    const groupOrderMap = buildImportedGroupOrderMap(importedRows);
    const nextRows = importedRows
      .map((row) => ({ ...row, order: groupOrderMap.get(row.group) || groupOrderMap.size + 1 }))
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a._index - b._index;
      });
    const groupCounter = new Map();
    const finalRows = nextRows.map(({ _index, ...item }) => {
      const groupKey = `${Number(item.order)}::${String(item.group || "")}`;
      const nextSubOrder = Number(groupCounter.get(groupKey) || 0) + 1;
      groupCounter.set(groupKey, nextSubOrder);
      return { ...item, subOrder: nextSubOrder };
    });

    const importedPlayerName = String(selectedPlayerDetail?.player || "").trim() || String(selectedPlayerName || "").trim() || String(playerOptions.find((item) => item.id === selectedPlayerId)?.player || "").trim();
    const importedMinutes = resolveImportedMinutes(selectedPlayerDetail.columns);
    const importedAge = resolveImportedAge(selectedPlayerDetail.columns);
    const importedPosition = resolveImportedPosition(selectedPlayerDetail.columns);
    const effectiveImportedName = importedPlayerName || String(meta.player || "").trim();
    const importedPlayerZh = String(getNameMappingRowsByEnglish().get(normalizePlayerName(effectiveImportedName).toLowerCase())?.zh || "").trim();
    const nextMeta = {
      ...meta,
      player: effectiveImportedName,
      playerZh: importedPlayerZh,
      age: importedAge || meta.age,
      position: importedPosition || meta.position,
      minutes: importedMinutes || meta.minutes
    };
    const titlePlayerName = formatRadarTitlePlayerName(nextMeta.player, nextMeta.playerZh);
    const nextTitle = `${titlePlayerName} (${nextMeta.age}, ${nextMeta.position}, ${nextMeta.minutes} mins.), ${nextMeta.club}`;
    const nextSubtitle = `${nextMeta.season} ${nextMeta.league} Percentile Rankings & Per 90 Values`;

    // Import updates data/title/meta, and resets corner image to avoid stale player photos.
    const currentSnapshot = getSnapshot();
    applySnapshot({
      ...currentSnapshot,
      rows: finalRows,
      meta: nextMeta,
      title: nextTitle,
      subtitle: nextSubtitle,
      cornerImage: DEFAULT_CORNER_IMAGE
    });
    setActivePage("radar");
    setPlayerDataError("");
    setPlayerDataMessage("");
    setError("");
    setMessage(`已导入 ${finalRows.length} 个指标并同步更新标题。`);
  };

  const updateMeta = (field, value) => {
    setMeta((prev) => ({ ...prev, [field]: value }));
  };

  const updateTextStyle = (field, value) => {
    if (field === "fontFamily") {
      setTextStyle((prev) => ({ ...prev, fontFamily: value }));
      return;
    }

    const num = Number(value);
    const safe = Number.isFinite(num) ? Math.min(48, Math.floor(num)) : 12;
    setTextStyle((prev) => ({ ...prev, [field]: safe }));
  };

  const updateChartStyle = (field, value) => {
    if (field === "ringLineStyle" || field === "ringDasharray" || field === "backgroundColor") {
      setChartStyle((prev) => ({ ...prev, [field]: value }));
      return;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const safe = field === "ringStrokeWidth" || field === "innerRingStrokeWidth" || field === "groupSeparatorWidth" ? Math.min(8, Number(num.toFixed(1))) : Number(num.toFixed(1));
    setChartStyle((prev) => ({ ...prev, [field]: safe }));
  };

  const getSnapshot = () => ({
    title,
    subtitle,
    rows,
    rowReorderMode,
    meta,
    textStyle,
    chartStyle,
    centerImage,
    cornerImage
  });

  const applySnapshot = (snapshot) => {
    const normalized = normalizeSnapshot(snapshot);
    setTitle(normalized.title);
    setSubtitle(normalized.subtitle);
    setRows(normalized.rows);
    setRowReorderMode(normalized.rowReorderMode);
    setMeta(normalized.meta);
    setTextStyle(normalized.textStyle);
    setChartStyle(normalized.chartStyle);
    setCenterImage(normalized.centerImage);
    setCornerImage(normalized.cornerImage);
  };

  const getPersistedState = (
    snapshot = getSnapshot(),
    presetList = presets,
    selectedId = selectedPresetId,
    playerMetricPresetList = playerMetricPresets,
    matchMetricPresetList = matchMetricPresets,
    selectedMatchMetricPresetMap = selectedMatchMetricPresetByDataset,
    projectMappingRowList = projectMappingRows,
    matchProjectMappingRowList = matchProjectMappingRows,
    nameMappingRowList = nameMappingRows,
    teamMappingRowList = teamMappingRows
  ) => ({
    draft: snapshot,
    presets: presetList,
    selectedPresetId: selectedId,
    playerMetricPresets: playerMetricPresetList,
    matchMetricPresets: matchMetricPresetList,
    selectedMatchMetricPresetByDataset: selectedMatchMetricPresetMap,
    projectMappingRows: projectMappingRowList,
    matchProjectMappingRows: matchProjectMappingRowList,
    nameMappingRows: nameMappingRowList,
    teamMappingRows: teamMappingRowList
  });

  const applyPersistedState = (persisted) => {
    const normalized = normalizePersistedState(persisted);
    const found = normalized.presets.find((item) => item.id === normalized.selectedPresetId);
    if (normalized.selectedPresetId !== "draft" && found?.payload) {
      applySnapshot(found.payload);
    } else {
      applySnapshot(normalized.draft);
    }
    setPresets(normalized.presets);
    setSelectedPresetId(normalized.selectedPresetId);
    setPlayerMetricPresets(normalized.playerMetricPresets);
    setMatchMetricPresets(normalized.matchMetricPresets);
    setSelectedMatchMetricPresetByDataset(normalized.selectedMatchMetricPresetByDataset);
  };

  const refreshMappingState = () => {
    setProjectMappingRows(getProjectMappingRows());
    setMatchProjectMappingRows(getMatchProjectMappingRows());
    setNameMappingRows(getNameMappingRows());
    setTeamMappingRows(getTeamMappingRows());
    setMappingRevision((prev) => prev + 1);
  };

  const getLocalMappingState = () => ({
    projectMappingRows: getProjectMappingRows(),
    matchProjectMappingRows: getMatchProjectMappingRows(),
    nameMappingRows: getNameMappingRows(),
    teamMappingRows: getTeamMappingRows()
  });

  const applyRemoteMappingState = (payload) => {
    let applied = false;
    if (Array.isArray(payload?.projectMappingRows)) {
      saveProjectMappingRows(payload.projectMappingRows);
      applied = true;
    }
    if (Array.isArray(payload?.matchProjectMappingRows)) {
      saveMatchProjectMappingRows(payload.matchProjectMappingRows);
      applied = true;
    }
    if (Array.isArray(payload?.nameMappingRows)) {
      saveNameMappingRows(payload.nameMappingRows);
      applied = true;
    }
    if (Array.isArray(payload?.teamMappingRows)) {
      saveTeamMappingRows(payload.teamMappingRows);
      applied = true;
    }
    return applied;
  };

  useEffect(() => {
    return subscribeMappingStoreChanged(() => {
      refreshMappingState();
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAuthStatus = async () => {
      try {
        const status = await fetchAuthStatus();
        if (cancelled) return;
        const usernameHint = String(status?.usernameHint || "player").trim() || "player";
        setAuthUsername(usernameHint);
        setLoginUsername(usernameHint);
        setAuthStatus(status?.authenticated ? "authenticated" : "anonymous");
      } catch {
        if (cancelled) return;
        setAuthStatus("anonymous");
      }
    };
    loadAuthStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated" || isHydrated) return;
    let cancelled = false;
    const hydrate = async () => {
      const localRawDraft = readStorage(STORAGE_KEYS.draft, null);
      const localRawPresets = readStorage(STORAGE_KEYS.presets, []);
      const localRawSelected = readStorage(STORAGE_KEYS.selectedPresetId, "draft");
      const localRawPlayerMetricPresets = readStorage(
        STORAGE_KEYS.playerMetricPresets,
        readStorage(STORAGE_KEYS.legacyPlayerMetricPresetsByDataset, [])
      );
      const localPersisted = normalizePersistedState({
        draft: localRawDraft,
        presets: localRawPresets,
        selectedPresetId: localRawSelected,
        playerMetricPresets: localRawPlayerMetricPresets,
        matchMetricPresets: readStorage(STORAGE_KEYS.matchMetricPresets, []),
        selectedMatchMetricPresetByDataset: readStorage(STORAGE_KEYS.selectedMatchMetricPresetByDataset, {})
      });
      const localMappingState = getLocalMappingState();
      const hasLocalSaved =
        Boolean(localRawDraft) ||
        (Array.isArray(localRawPresets) && localRawPresets.length > 0) ||
        normalizePlayerMetricPresets(localRawPlayerMetricPresets).length > 0 ||
        normalizeMatchMetricPresets(readStorage(STORAGE_KEYS.matchMetricPresets, [])).length > 0 ||
        Object.keys(normalizeSelectionMap(readStorage(STORAGE_KEYS.selectedMatchMetricPresetByDataset, {}))).length > 0 ||
        localRawSelected !== "draft";
      const shouldMigrateLocal =
        hasLocalSaved ||
        localMappingState.projectMappingRows.length > 0 ||
        localMappingState.matchProjectMappingRows.length > 0 ||
        localMappingState.nameMappingRows.length > 0 ||
        localMappingState.teamMappingRows.length > 0;
      const localMetricPresetSelection = normalizeSelectionMap(readStorage(STORAGE_KEYS.selectedPlayerMetricPresetByDataset, {}));

      try {
        const remote = await fetchState();
        if (cancelled) return;

        if (remote?.data) {
          applyPersistedState(remote.data);
          applyRemoteMappingState(remote.data);
          const payloadWithMappings = {
            ...remote.data,
            projectMappingRows: Array.isArray(remote.data.projectMappingRows) ? remote.data.projectMappingRows : localMappingState.projectMappingRows,
            matchProjectMappingRows: Array.isArray(remote.data.matchProjectMappingRows)
              ? remote.data.matchProjectMappingRows
              : localMappingState.matchProjectMappingRows,
            nameMappingRows: Array.isArray(remote.data.nameMappingRows) ? remote.data.nameMappingRows : localMappingState.nameMappingRows,
            teamMappingRows: Array.isArray(remote.data.teamMappingRows) ? remote.data.teamMappingRows : localMappingState.teamMappingRows
          };
          const missingMappingData =
            !Array.isArray(remote.data.projectMappingRows) ||
            !Array.isArray(remote.data.matchProjectMappingRows) ||
            !Array.isArray(remote.data.nameMappingRows) ||
            !Array.isArray(remote.data.teamMappingRows);
          if (missingMappingData) {
            await saveState(payloadWithMappings);
            if (cancelled) return;
          }
          setSelectedPlayerMetricPresetByDataset(localMetricPresetSelection);
          setStorageStatus("online");
        } else if (shouldMigrateLocal) {
          const migrated = await migrateFromLocal({
            ...localPersisted,
            ...localMappingState
          });
          if (cancelled) return;
          if (migrated?.migrated) {
            writeStorage(STORAGE_KEYS.localMigrated, true);
            const migratedState = await fetchState();
            if (cancelled) return;
            if (migratedState?.data) {
              applyPersistedState(migratedState.data);
              applyRemoteMappingState(migratedState.data);
            } else {
              applyPersistedState(localPersisted);
              applyRemoteMappingState(localMappingState);
            }
            setMessage("已将本地历史数据迁移到后端。");
          } else {
            applyPersistedState(localPersisted);
            applyRemoteMappingState(localMappingState);
          }
          setSelectedPlayerMetricPresetByDataset(localMetricPresetSelection);
          setStorageStatus("online");
        } else {
          applyPersistedState(localPersisted);
          applyRemoteMappingState(localMappingState);
          setSelectedPlayerMetricPresetByDataset(localMetricPresetSelection);
          setStorageStatus("online");
        }
      } catch {
        if (cancelled) return;
        applyPersistedState(localPersisted);
        applyRemoteMappingState(localMappingState);
        setSelectedPlayerMetricPresetByDataset(localMetricPresetSelection);
        setStorageStatus("offline");
      } finally {
        if (cancelled) return;
        refreshMappingState();
        setIsHydrated(true);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [authStatus, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    const snapshot = getSnapshot();
    const writes = [{ label: "draft", key: STORAGE_KEYS.draft, value: snapshot }, { label: "selectedPresetId", key: STORAGE_KEYS.selectedPresetId, value: selectedPresetId }, { label: "presets", key: STORAGE_KEYS.presets, value: presets }];
    const failed = [];
    for (const item of writes) {
      let result = writeStorageWithResult(item.key, item.value);
      if (!result.ok && isQuotaExceededResult(result)) {
        if (item.label === "draft") {
          result = writeStorageWithResult(item.key, compactSnapshotForLocalStorage(snapshot));
        } else if (item.label === "presets") {
          result = writeStorageWithResult(item.key, compactPresetsForLocalStorage(presets));
        }
      }
      if (!result.ok) {
        failed.push({ ...item, result });
      }
    }
    if (failed.length > 0) {
      const detail = failed.map((item) => `${item.label}(${item.result.error})`).join("; ");
      setError(`本地缓存写入失败：${detail}`);
    } else {
      setError((prev) => (prev.startsWith("本地缓存写入失败：") ? "" : prev));
    }
  }, [title, subtitle, rows, rowReorderMode, meta, textStyle, chartStyle, centerImage, cornerImage, selectedPresetId, presets, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeStorage(STORAGE_KEYS.metricSelectionsByDataset, metricSelectionsByDataset);
  }, [metricSelectionsByDataset, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeStorage(STORAGE_KEYS.playerMetricPresets, playerMetricPresets);
  }, [playerMetricPresets, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeStorage(STORAGE_KEYS.matchMetricPresets, matchMetricPresets);
  }, [matchMetricPresets, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeStorage(STORAGE_KEYS.selectedPlayerMetricPresetByDataset, selectedPlayerMetricPresetByDataset);
  }, [selectedPlayerMetricPresetByDataset, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeStorage(STORAGE_KEYS.selectedMatchMetricPresetByDataset, selectedMatchMetricPresetByDataset);
  }, [selectedMatchMetricPresetByDataset, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeStorage(STORAGE_KEYS.playerSearchByDataset, playerSearchByDataset);
  }, [playerSearchByDataset, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeStorage(STORAGE_KEYS.selectedPlayerByDataset, selectedPlayerByDataset);
  }, [selectedPlayerByDataset, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeStorage(STORAGE_KEYS.radarPngExportSequenceByVersion, radarPngExportSequenceByVersion);
  }, [radarPngExportSequenceByVersion, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    if (selectedPresetId === "draft") return;
    setPresets((prev) =>
      prev.map((item) =>
        item.id === selectedPresetId
          ? { ...item, payload: getSnapshot(), updatedAt: new Date().toISOString() }
          : item
      )
    );
  }, [title, subtitle, rows, rowReorderMode, meta, textStyle, chartStyle, centerImage, cornerImage, selectedPresetId, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    const payload = getPersistedState();
    saveTimerRef.current = setTimeout(async () => {
      const seq = saveSeqRef.current + 1;
      saveSeqRef.current = seq;
      try {
        await saveState(payload);
        if (saveSeqRef.current === seq) {
          setStorageStatus("online");
        }
      } catch {
        if (saveSeqRef.current === seq) {
          setStorageStatus("offline");
        }
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    title,
    subtitle,
    rows,
    rowReorderMode,
    meta,
    textStyle,
    chartStyle,
    centerImage,
    cornerImage,
    presets,
    selectedPresetId,
    playerMetricPresets,
    matchMetricPresets,
    selectedMatchMetricPresetByDataset,
    projectMappingRows,
    matchProjectMappingRows,
    nameMappingRows,
    teamMappingRows,
    isHydrated
  ]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const ok = await verifyBackendHealth();
      if (cancelled) return;
      if (!ok && activePage === "player_data" && !playerDataImporting) {
        setPlayerDataError(`后端未连接：请确认后端服务已启动并可访问（当前 API：${apiBaseLabel}）`);
      }
    };
    run();
    const timer = setInterval(run, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, playerDataImporting]);

  useEffect(() => {
    const hydratePlayerDataPage = async () => {
      if (activePage !== "player_data") return;
      const cachedQuery = selectedDatasetId ? String(playerSearchByDataset[selectedDatasetId] || "") : "";
      if (cachedQuery !== playerSearchQuery) {
        setPlayerSearchQuery(cachedQuery);
      }
      const preferredPlayerId = selectedDatasetId ? String(selectedPlayerByDataset[selectedDatasetId] || selectedPlayerId || "") : selectedPlayerId;
      const datasetId = await loadDatasets(selectedDatasetId);
      await loadPlayerList(datasetId, preferredPlayerId);
    };
    hydratePlayerDataPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "player_data") return;
    const cachedQuery = selectedDatasetId ? String(playerSearchByDataset[selectedDatasetId] || "") : "";
    if (cachedQuery !== playerSearchQuery) {
      setPlayerSearchQuery(cachedQuery);
    }
    const preferredPlayerId = selectedDatasetId ? String(selectedPlayerByDataset[selectedDatasetId] || selectedPlayerId || "") : selectedPlayerId;
    loadPlayerList(selectedDatasetId, preferredPlayerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    setPlayerSearchByDataset((prev) => (prev[selectedDatasetId] === playerSearchQuery ? prev : { ...prev, [selectedDatasetId]: playerSearchQuery }));
  }, [selectedDatasetId, playerSearchQuery]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    setSelectedPlayerByDataset((prev) => (prev[selectedDatasetId] === selectedPlayerId ? prev : { ...prev, [selectedDatasetId]: selectedPlayerId }));
  }, [selectedDatasetId, selectedPlayerId]);

  useEffect(() => {
    if (activePage !== "player_data") return;
    if (filteredPlayerOptions.length === 0) return;
    if (!filteredPlayerOptions.some((item) => String(item.id) === String(selectedPlayerId))) setSelectedPlayerId(String(filteredPlayerOptions[0].id || ""));
  }, [activePage, filteredPlayerOptions, selectedPlayerId]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    const numericColumns = Array.isArray(playerDataMeta.numericColumns) ? playerDataMeta.numericColumns : [];
    setMetricSelectionsByDataset((prev) => {
      const current = Array.isArray(prev[selectedDatasetId]) ? prev[selectedDatasetId] : [];
      const valid = current.filter((col) => numericColumns.includes(col));
      const next = valid.length > 0 ? valid : numericColumns;
      if (current.length === next.length && current.every((col, idx) => col === next[idx])) {
        return prev;
      }
      return { ...prev, [selectedDatasetId]: next };
    });
  }, [selectedDatasetId, playerDataMeta.numericColumns]);

  useEffect(() => {
    const loadPlayerDetail = async () => {
      if (activePage !== "player_data" || !selectedPlayerId) {
        setSelectedPlayerDetail(null);
        return;
      }
      const seq = playerDetailReqSeqRef.current + 1;
      playerDetailReqSeqRef.current = seq;
      setPlayerDataLoading(true);
      setPlayerDataError("");
      try {
        const res = await fetchPlayerById(selectedPlayerId, selectedDatasetId);
        if (playerDetailReqSeqRef.current !== seq) return;
        setSelectedPlayerDetail(res.player || null);
      } catch (err) {
        if (playerDetailReqSeqRef.current !== seq) return;
        setPlayerDataError(`球员详情读取失败：${err.message}`);
        setSelectedPlayerDetail(null);
      } finally {
        if (playerDetailReqSeqRef.current === seq) {
          setPlayerDataLoading(false);
        }
      }
    };
    loadPlayerDetail();
  }, [activePage, selectedPlayerId, selectedDatasetId, playerDetailReloadTick]);

  const handleSavePreset = () => {
    const name = saveName.trim();
    if (!name) {
      setError("请输入版本名称。");
      setMessage("");
      return;
    }

    const newPreset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      updatedAt: new Date().toISOString(),
      payload: getSnapshot()
    };
    setPresets((prev) => [newPreset, ...prev]);
    setSelectedPresetId(newPreset.id);
    setSaveName("");
    setMessage(`已保存版本：${name}（含数据+图表样式）`);
    setError("");
  };

  const handleSwitchPreset = (targetId) => {
    writeStorage(STORAGE_KEYS.draft, getSnapshot());

    if (targetId === "draft") {
      const draft = readStorage(STORAGE_KEYS.draft, null);
      if (draft) {
        applySnapshot(draft);
      }
      setSelectedPresetId("draft");
      setMessage("已切换到当前草稿");
      setError("");
      return;
    }

    const found = presets.find((item) => item.id === targetId);
    if (!found) {
      setError("未找到该版本。");
      setMessage("");
      return;
    }

    applySnapshot(found.payload);
    setSelectedPresetId(targetId);
    setMessage(`已切换到版本：${found.name}（已载入数据+图表样式）`);
    setError("");
  };

  const handleDeletePreset = () => {
    if (selectedPresetId === "draft") {
      setError("当前草稿不能删除。");
      setMessage("");
      return;
    }

    const found = presets.find((item) => item.id === selectedPresetId);
    setPresets((prev) => prev.filter((item) => item.id !== selectedPresetId));
    setSelectedPresetId("draft");
    setMessage(found ? `已删除版本：${found.name}` : "已删除版本");
    setError("");
  };

  const applyTitleTemplate = () => {
    const effectivePlayerName = String(meta.player || "").trim() || String(selectedPlayerName || "").trim() || String(playerOptions.find((item) => item.id === selectedPlayerId)?.player || "").trim();
    const titlePlayerName = formatRadarTitlePlayerName(effectivePlayerName, meta.playerZh);
    const titleText = `${titlePlayerName} (${meta.age}, ${meta.position}, ${meta.minutes} mins.), ${meta.club}`;
    const subtitleText = `${meta.season} ${meta.league} Percentile Rankings & Per 90 Values`;
    setTitle(titleText);
    setSubtitle(subtitleText);
    setMessage("已应用标题模板");
    setError("");
  };

  const onCenterImageClick = () => centerImageInputRef.current?.click();

  const onCenterImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("仅支持 PNG / JPG / WEBP 图片。");
      setMessage("");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("图片请控制在 2MB 以内。");
      setMessage("");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      setCenterImage((prev) => ({ ...prev, src, scale: prev.scale || 1 }));
      setMessage("中心图片已更新。");
      setError("");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const updateCenterImageScale = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const scale = Math.max(0.5, Math.min(2.5, Number(num.toFixed(2))));
    setCenterImage((prev) => ({ ...prev, scale }));
  };

  const clearCenterImage = () => {
    setCenterImage(DEFAULT_CENTER_IMAGE);
    setMessage("已清除中心图片。");
    setError("");
  };

  const onCornerImageClick = () => cornerImageInputRef.current?.click();

  const onCornerImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("仅支持 PNG / JPG / WEBP 图片。");
      setMessage("");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("图片请控制在 2MB 以内。");
      setMessage("");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      setCornerImage({ ...DEFAULT_CORNER_IMAGE, src });
      setMessage("左上角图片已更新。");
      setError("");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const updateCornerImage = (field, value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    if (field === "size") {
      setCornerImage((prev) => ({ ...prev, size: Number(num.toFixed(1)) }));
      return;
    }
    setCornerImage((prev) => ({ ...prev, [field]: Number(num.toFixed(1)) }));
  };

  const clearCornerImage = () => {
    setCornerImage(DEFAULT_CORNER_IMAGE);
    setMessage("已清除左上角图片。");
    setError("");
  };

  const exportSvg = () => {
    const svg = document.getElementById("radar-svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const text = serializer.serializeToString(svg);
    downloadFile("player_radar.svg", text, "image/svg+xml;charset=utf-8");
  };

  const exportPng = () => {
    const svg = document.getElementById("radar-svg");
    if (!svg) return;
    const currentPreset = selectedPresetId === "draft" ? null : presets.find((item) => item.id === selectedPresetId);
    const versionLabel = sanitizeExportFilenamePart(currentPreset?.name || saveName || "当前草稿");
    const sequenceKey = currentPreset?.id || `draft:${versionLabel}`;
    const nextSequence = (radarPngExportSequenceByVersion[sequenceKey] || 0) + 1;
    const exportFilename = `${versionLabel}${String(nextSequence).padStart(2, "0")}.png`;
    const serializer = new XMLSerializer();
    const text = serializer.serializeToString(svg);
    const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1600;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = chartStyle.backgroundColor || "#f8f5ef";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = exportFilename;
      a.click();
      setRadarPngExportSequenceByVersion((prev) => ({ ...prev, [sequenceKey]: nextSequence }));
      setMessage(`已导出 PNG：${exportFilename}`);
      setError("");
    };
    image.src = url;
  };

  const radarPage = (
    <RadarEditorPage
      title={title}
      setTitle={setTitle}
      subtitle={subtitle}
      setSubtitle={setSubtitle}
      saveName={saveName}
      setSaveName={setSaveName}
      handleSavePreset={handleSavePreset}
      selectedPresetId={selectedPresetId}
      handleSwitchPreset={handleSwitchPreset}
      presets={presets}
      handleDeletePreset={handleDeletePreset}
      titlePanelOpen={titlePanelOpen}
      setTitlePanelOpen={setTitlePanelOpen}
      meta={meta}
      updateMeta={updateMeta}
      applyTitleTemplate={applyTitleTemplate}
      fontPanelOpen={fontPanelOpen}
      setFontPanelOpen={setFontPanelOpen}
      textStyle={textStyle}
      updateTextStyle={updateTextStyle}
      chartStyle={chartStyle}
      updateChartStyle={updateChartStyle}
      imagePanelOpen={imagePanelOpen}
      setImagePanelOpen={setImagePanelOpen}
      onCenterImageClick={onCenterImageClick}
      clearCenterImage={clearCenterImage}
      centerImage={centerImage}
      updateCenterImageScale={updateCenterImageScale}
      centerImageInputRef={centerImageInputRef}
      onCenterImageChange={onCenterImageChange}
      onCornerImageClick={onCornerImageClick}
      clearCornerImage={clearCornerImage}
      cornerImage={cornerImage}
      updateCornerImage={updateCornerImage}
      cornerImageInputRef={cornerImageInputRef}
      onCornerImageChange={onCornerImageChange}
      addRow={addRow}
      downloadCsv={downloadCsv}
      onUploadClick={onUploadClick}
      exportSvg={exportSvg}
      exportPng={exportPng}
      fileInputRef={fileInputRef}
      onCsvFileChange={onCsvFileChange}
      message={message}
      error={error}
      dataTablePanelOpen={dataTablePanelOpen}
      setDataTablePanelOpen={setDataTablePanelOpen}
      rows={rows}
      updateCell={updateCell}
      moveRow={moveRow}
      removeRow={removeRow}
      sortedRows={sortedRows}
      stats={stats}
      groupLabelLayouts={groupLabelLayouts}
    />
  );

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = loginUsername.trim();
    if (!username || !loginPassword) {
      setLoginError("请输入共享账号和密码。");
      return;
    }

    setLoginSubmitting(true);
    setLoginError("");
    try {
      const result = await loginSharedSession(username, loginPassword);
      const nextUsername = String(result?.username || username).trim() || username;
      setAuthUsername(nextUsername);
      setLoginUsername(nextUsername);
      setLoginPassword("");
      setIsHydrated(false);
      setAuthStatus("authenticated");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "登录失败。");
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutSharedSession();
    } catch {
      // Ignore logout errors and still force the client back to the login screen.
    }
    setAuthStatus("anonymous");
    setIsHydrated(false);
    setLoginPassword("");
    setLoginError("");
  };

  if (authStatus === "checking" || (authStatus === "authenticated" && !isHydrated)) {
    return (
      <div className="login-shell">
        <div className="login-card login-card-loading">
          <div className="login-eyebrow">共享工作台登录</div>
          <h1>正在准备工作台</h1>
          <p className="login-copy">正在校验登录状态并同步服务器数据。</p>
        </div>
      </div>
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <SharedLoginPage
        username={loginUsername}
        password={loginPassword}
        onUsernameChange={(value) => setLoginUsername(value)}
        onPasswordChange={(value) => setLoginPassword(value)}
        onSubmit={handleLogin}
        submitting={loginSubmitting}
        error={loginError}
      />
    );
  }

  return (
    <div className="app-shell">
      <TopNav
        activePage={activePage}
        onChangePage={(pageKey) => {
          if (!isAppPageKey(pageKey)) return;
          setActivePage(pageKey);
        }}
        authUsername={authUsername}
        onLogout={handleLogout}
      />
      <main className="content-shell">
        {renderActivePage({
          activePage,
          setActivePage,
          radarPage,
          playerDataPageProps: {
            playerDataMeta,
            formatDateTime,
            selectedDatasetId,
            setSelectedDatasetId,
            datasetOptions,
            onPlayerExcelUploadClick,
            playerDataImporting,
            backendHealth,
            handleDeleteCurrentDataset,
            playerExcelInputRef,
            onPlayerExcelChange,
            playerSearchQuery,
            setPlayerSearchQuery,
            playerOptions,
            selectedPlayerId,
            setSelectedPlayerId,
            filteredPlayerOptions,
            playerDataMessage,
            playerDataError,
            selectedPlayerName,
            selectedMetricColumns,
            playerMetricPresetOptions,
            selectedPlayerMetricPresetId,
            handleSelectAllMetricColumns,
            handleClearMetricColumns,
            handleSavePlayerMetricPreset,
            handleRenamePlayerMetricPreset,
            handleDeletePlayerMetricPreset,
            applyPlayerMetricPreset,
            handleImportSelectedMetricsToRadar,
            playerDataLoading,
            playerDataMetaNumericColumns: playerDataMeta.numericColumns || [],
            selectedPlayerDetail,
            handleToggleMetricColumn,
            formatPlayerDataColumnLabel
          },
          scatterPageProps: {
            datasetOptions,
            selectedDatasetId,
            setSelectedDatasetId,
            onDeleteCurrentDataset: handleDeleteCurrentDataset,
            scatterLoading: scatterDataLoading,
            scatterError: scatterDataError,
            scatterDoc: scatterDatasetDoc,
            scatterConfig,
            onScatterConfigChange: updateScatterConfig,
            formatPlayerDataColumnLabel,
            mappingRevision
          },
          playerPersonalRadarProps: {
            datasetOptions,
            selectedDatasetId,
            setSelectedDatasetId,
            onDeleteCurrentDataset: handleDeleteCurrentDataset,
            scatterLoading: scatterDataLoading,
            scatterError: scatterDataError,
            scatterDoc: scatterDatasetDoc,
            mappingRevision
          },
          matchTeamDataPageProps: {
            matchMetricPresets,
            setMatchMetricPresets,
            selectedMatchMetricPresetByDataset,
            setSelectedMatchMetricPresetByDataset
          },
          mappingRevision
        })}
      </main>
    </div>
  );
}
export default App;
