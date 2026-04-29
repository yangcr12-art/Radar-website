import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  checkHealth,
  deletePlayerDataset,
  fetchPlayerById,
  fetchPlayerDatasets,
  fetchPlayerList,
  fetchState,
  getApiBaseLabel,
  importPlayerExcel,
  migrateFromLocal,
  saveState
} from "./api/storageClient";
import { DEFAULT_CORNER_IMAGE, STORAGE_KEYS } from "./app/constants";
import { isAppPageKey, type AppPageKey } from "./app/pageRegistry";
import { renderActivePage } from "./app/renderActivePage";
import {
  computeTierFromValue,
  formatPlayerDataColumnLabel,
  formatRadarTitlePlayerName,
  getMetricDisplayNameFromColumn,
  inferMetricGroupAndOrder,
  normalizeMatchMetricPresets,
  normalizePersistedState,
  normalizePlayerMetricPresets,
  normalizeSelectionMap,
  readStorage,
  resolveImportedAge,
  resolveImportedMinutes,
  resolveImportedPosition,
  toCsv,
  writeStorage,
  writeStorageWithResult
} from "./app/radar/radarState";
import AppLoadingScreen from "./components/AppLoadingScreen";
import RadarEditorPage from "./components/RadarEditorPage";
import SharedLoginPage from "./components/SharedLoginPage";
import TopNav from "./components/TopNav";
import useRadarEditorController from "./hooks/useRadarEditorController";
import useScatterPlotState from "./hooks/useScatterPlotState";
import { useSharedAuth } from "./hooks/useSharedAuth";
import { buildImportedGroupOrderMap, normalizeImportedGroupName } from "./utils/importGroupOrder";
import { subscribeMappingStoreChanged } from "./utils/mappingSync";
import { getMatchProjectMappingRows, saveMatchProjectMappingRows } from "./utils/matchProjectMappingStore";
import { getNameMappingRows, getNameMappingRowsByEnglish, normalizePlayerName, saveNameMappingRows } from "./utils/nameMappingStore";
import { getProjectGroupByColumn, getProjectMappingRows, saveProjectMappingRows } from "./utils/projectMappingStore";
import { getTeamMappingRows, saveTeamMappingRows } from "./utils/teamMappingStore";
import { formatDateTime } from "./utils/timeFormat";

function App() {
  const apiBaseLabel = getApiBaseLabel();
  const [activePage, setActivePage] = useState<AppPageKey>("radar");
  const [isHydrated, setIsHydrated] = useState(false);
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
  const [projectMappingRows, setProjectMappingRows] = useState(() => getProjectMappingRows());
  const [matchProjectMappingRows, setMatchProjectMappingRows] = useState(() => getMatchProjectMappingRows());
  const [nameMappingRows, setNameMappingRows] = useState(() => getNameMappingRows());
  const [teamMappingRows, setTeamMappingRows] = useState(() => getTeamMappingRows());
  const [latestMatchRadarImportPayload, setLatestMatchRadarImportPayload] = useState<any>(null);
  const [mappingRevision, setMappingRevision] = useState(0);
  const [, setStorageStatus] = useState("connecting");
  const playerExcelInputRef = useRef<any>(null);
  const saveTimerRef = useRef<any>(null);
  const saveSeqRef = useRef(0);
  const playerDetailReqSeqRef = useRef(0);

  const {
    authStatus,
    authUsername,
    loginUsername,
    setLoginUsername,
    loginPassword,
    setLoginPassword,
    loginSubmitting,
    loginError,
    handleLogin,
    handleLogout,
    authHydrationVersion
  } = useSharedAuth();

  const selectedMetricColumns = useMemo(() => {
    if (!selectedDatasetId) return [];
    const numericColumns = Array.isArray(playerDataMeta.numericColumns) ? playerDataMeta.numericColumns : [];
    const selected = Array.isArray(metricSelectionsByDataset[selectedDatasetId]) ? metricSelectionsByDataset[selectedDatasetId] : [];
    return selected.filter((col) => numericColumns.includes(col));
  }, [selectedDatasetId, metricSelectionsByDataset, playerDataMeta.numericColumns]);

  const playerMetricPresetOptions = useMemo(() => playerMetricPresets, [playerMetricPresets]);

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

  const radarEditor = useRadarEditorController({
    readStorage,
    writeStorage,
    writeStorageWithResult,
    toCsv,
    isHydrated,
    resolveSelectedPlayerName: () => selectedPlayerName
  });

  const onPlayerExcelUploadClick = () => playerExcelInputRef.current?.click();

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
    } catch (err: any) {
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

  const loadPlayerList = async (datasetId: string, preferredPlayerId = "") => {
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
    } catch (err: any) {
      setPlayerDataError(`球员数据读取失败：${err.message}`);
      setPlayerOptions([]);
      setSelectedPlayerId("");
      setSelectedPlayerDetail(null);
    } finally {
      setPlayerDataLoading(false);
    }
  };

  const onPlayerExcelChange = async (event: any) => {
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
    } catch (err: any) {
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
    } catch (err: any) {
      setPlayerDataError(`删除数据集失败：${err.message}`);
    }
  };

  const handleToggleMetricColumn = (column: string) => {
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

  const applyPlayerMetricPreset = (presetId: string) => {
    if (!selectedDatasetId) return;
    setSelectedPlayerMetricPresetByDataset((prev) => {
      const next = { ...prev };
      if (presetId) next[selectedDatasetId] = presetId;
      else delete next[selectedDatasetId];
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

    const detailMap = new Map(selectedPlayerDetail.columns.map((item: any) => [String(item.column || ""), item]));
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
      .filter(Boolean) as any[];

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

    const importedPlayerName =
      String(selectedPlayerDetail?.player || "").trim() ||
      String(selectedPlayerName || "").trim() ||
      String(playerOptions.find((item) => item.id === selectedPlayerId)?.player || "").trim();
    const importedMinutes = resolveImportedMinutes(selectedPlayerDetail.columns);
    const importedAge = resolveImportedAge(selectedPlayerDetail.columns);
    const importedPosition = resolveImportedPosition(selectedPlayerDetail.columns);
    const effectiveImportedName = importedPlayerName || String(radarEditor.meta.player || "").trim();
    const importedPlayerZh = String(getNameMappingRowsByEnglish().get(normalizePlayerName(effectiveImportedName).toLowerCase())?.zh || "").trim();
    const nextMeta = {
      ...radarEditor.meta,
      player: effectiveImportedName,
      playerZh: importedPlayerZh,
      age: importedAge || radarEditor.meta.age,
      position: importedPosition || radarEditor.meta.position,
      minutes: importedMinutes || radarEditor.meta.minutes
    };
    const titlePlayerName = formatRadarTitlePlayerName(nextMeta.player, nextMeta.playerZh);
    const nextTitle = `${titlePlayerName} (${nextMeta.age}, ${nextMeta.position}, ${nextMeta.minutes} mins.), ${nextMeta.club}`;
    const nextSubtitle = `${nextMeta.season} ${nextMeta.league} Percentile Rankings & Per 90 Values`;

    radarEditor.applySnapshot({
      ...radarEditor.getSnapshot(),
      rows: finalRows,
      meta: nextMeta,
      title: nextTitle,
      subtitle: nextSubtitle,
      cornerImage: DEFAULT_CORNER_IMAGE
    });
    setActivePage("radar");
    setPlayerDataError("");
    setPlayerDataMessage("");
    radarEditor.setError("");
    radarEditor.setMessage(`已导入 ${finalRows.length} 个指标并同步更新标题。`);
  };

  const getPersistedState = (
    snapshot = radarEditor.getSnapshot(),
    presetList = radarEditor.presets,
    selectedId = radarEditor.selectedPresetId,
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

  const applyPersistedState = (persisted: any) => {
    const normalized = normalizePersistedState(persisted);
    const found = normalized.presets.find((item: any) => item.id === normalized.selectedPresetId);
    if (normalized.selectedPresetId !== "draft" && found?.payload) {
      radarEditor.applySnapshot(found.payload);
    } else {
      radarEditor.applySnapshot(normalized.draft);
    }
    radarEditor.setPresets(normalized.presets);
    radarEditor.setSelectedPresetId(normalized.selectedPresetId);
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

  const applyRemoteMappingState = (payload: any) => {
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

  useEffect(() => subscribeMappingStoreChanged(() => refreshMappingState()), []);

  useEffect(() => {
    setIsHydrated(false);
  }, [authHydrationVersion]);

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
          const migrated = await migrateFromLocal({ ...localPersisted, ...localMappingState });
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
            radarEditor.setMessage("已将本地历史数据迁移到后端。");
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
  }, [authStatus, isHydrated, authHydrationVersion]);

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
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const payload = getPersistedState();
    saveTimerRef.current = setTimeout(async () => {
      const seq = saveSeqRef.current + 1;
      saveSeqRef.current = seq;
      try {
        await saveState(payload);
        if (saveSeqRef.current === seq) setStorageStatus("online");
      } catch {
        if (saveSeqRef.current === seq) setStorageStatus("offline");
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    radarEditor.title,
    radarEditor.subtitle,
    radarEditor.rows,
    radarEditor.rowReorderMode,
    radarEditor.meta,
    radarEditor.textStyle,
    radarEditor.chartStyle,
    radarEditor.centerImage,
    radarEditor.cornerImage,
    radarEditor.presets,
    radarEditor.selectedPresetId,
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
  }, [activePage, playerDataImporting, apiBaseLabel]);

  useEffect(() => {
    const hydratePlayerDataPage = async () => {
      if (activePage !== "player_data") return;
      const cachedQuery = selectedDatasetId ? String(playerSearchByDataset[selectedDatasetId] || "") : "";
      if (cachedQuery !== playerSearchQuery) setPlayerSearchQuery(cachedQuery);
      const preferredPlayerId = selectedDatasetId ? String(selectedPlayerByDataset[selectedDatasetId] || selectedPlayerId || "") : selectedPlayerId;
      const datasetId = await loadDatasets(selectedDatasetId);
      await loadPlayerList(datasetId, preferredPlayerId);
    };
    hydratePlayerDataPage();
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "player_data") return;
    const cachedQuery = selectedDatasetId ? String(playerSearchByDataset[selectedDatasetId] || "") : "";
    if (cachedQuery !== playerSearchQuery) setPlayerSearchQuery(cachedQuery);
    const preferredPlayerId = selectedDatasetId ? String(selectedPlayerByDataset[selectedDatasetId] || selectedPlayerId || "") : selectedPlayerId;
    loadPlayerList(selectedDatasetId, preferredPlayerId);
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
    const filteredPlayerOptions = playerOptions.filter((item) => String(item.player || "").toLowerCase().includes(playerSearchQuery.trim().toLowerCase()));
    if (filteredPlayerOptions.length === 0) return;
    if (!filteredPlayerOptions.some((item) => String(item.id) === String(selectedPlayerId))) {
      setSelectedPlayerId(String(filteredPlayerOptions[0].id || ""));
    }
  }, [activePage, playerOptions, playerSearchQuery, selectedPlayerId]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    const numericColumns = Array.isArray(playerDataMeta.numericColumns) ? playerDataMeta.numericColumns : [];
    setMetricSelectionsByDataset((prev) => {
      const current = Array.isArray(prev[selectedDatasetId]) ? prev[selectedDatasetId] : [];
      const valid = current.filter((col) => numericColumns.includes(col));
      const next = valid.length > 0 ? valid : numericColumns;
      if (current.length === next.length && current.every((col, idx) => col === next[idx])) return prev;
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
      } catch (err: any) {
        if (playerDetailReqSeqRef.current !== seq) return;
        setPlayerDataError(`球员详情读取失败：${err.message}`);
        setSelectedPlayerDetail(null);
      } finally {
        if (playerDetailReqSeqRef.current === seq) setPlayerDataLoading(false);
      }
    };
    loadPlayerDetail();
  }, [activePage, selectedPlayerId, selectedDatasetId, playerDetailReloadTick]);

  const filteredPlayerOptions = useMemo(() => {
    const keyword = playerSearchQuery.trim().toLowerCase();
    if (!keyword) return playerOptions;
    return playerOptions.filter((item) => String(item.player || "").toLowerCase().includes(keyword));
  }, [playerOptions, playerSearchQuery]);

  const radarPage = (
    <RadarEditorPage
      title={radarEditor.title}
      setTitle={radarEditor.setTitle}
      subtitle={radarEditor.subtitle}
      setSubtitle={radarEditor.setSubtitle}
      saveName={radarEditor.saveName}
      setSaveName={radarEditor.setSaveName}
      handleSavePreset={radarEditor.handleSavePreset}
      selectedPresetId={radarEditor.selectedPresetId}
      handleSwitchPreset={radarEditor.handleSwitchPreset}
      presets={radarEditor.presets}
      handleDeletePreset={radarEditor.handleDeletePreset}
      titlePanelOpen={radarEditor.titlePanelOpen}
      setTitlePanelOpen={radarEditor.setTitlePanelOpen}
      meta={radarEditor.meta}
      updateMeta={radarEditor.updateMeta}
      applyTitleTemplate={radarEditor.applyTitleTemplate}
      fontPanelOpen={radarEditor.fontPanelOpen}
      setFontPanelOpen={radarEditor.setFontPanelOpen}
      textStyle={radarEditor.textStyle}
      updateTextStyle={radarEditor.updateTextStyle}
      chartStyle={radarEditor.chartStyle}
      updateChartStyle={radarEditor.updateChartStyle}
      imagePanelOpen={radarEditor.imagePanelOpen}
      setImagePanelOpen={radarEditor.setImagePanelOpen}
      onCenterImageClick={radarEditor.onCenterImageClick}
      clearCenterImage={radarEditor.clearCenterImage}
      centerImage={radarEditor.centerImage}
      updateCenterImageScale={radarEditor.updateCenterImageScale}
      centerImageInputRef={radarEditor.centerImageInputRef}
      onCenterImageChange={radarEditor.onCenterImageChange}
      onCornerImageClick={radarEditor.onCornerImageClick}
      clearCornerImage={radarEditor.clearCornerImage}
      cornerImage={radarEditor.cornerImage}
      updateCornerImage={radarEditor.updateCornerImage}
      cornerImageInputRef={radarEditor.cornerImageInputRef}
      onCornerImageChange={radarEditor.onCornerImageChange}
      addRow={radarEditor.addRow}
      downloadCsv={radarEditor.downloadCsv}
      onUploadClick={radarEditor.onUploadClick}
      exportSvg={radarEditor.exportSvg}
      exportPng={radarEditor.exportPng}
      fileInputRef={radarEditor.fileInputRef}
      onCsvFileChange={radarEditor.onCsvFileChange}
      message={radarEditor.message}
      error={radarEditor.error}
      dataTablePanelOpen={radarEditor.dataTablePanelOpen}
      setDataTablePanelOpen={radarEditor.setDataTablePanelOpen}
      rows={radarEditor.rows}
      updateCell={radarEditor.updateCell}
      moveRow={radarEditor.moveRow}
      removeRow={radarEditor.removeRow}
      sortedRows={radarEditor.sortedRows}
      stats={radarEditor.stats}
      groupLabelLayouts={radarEditor.groupLabelLayouts}
    />
  );

  if (authStatus === "checking" || (authStatus === "authenticated" && !isHydrated)) {
    return <AppLoadingScreen />;
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
            setSelectedMatchMetricPresetByDataset,
            onMatchRadarImportPayload: (payload: any) => setLatestMatchRadarImportPayload(payload)
          },
          matchRadarPageProps: {
            latestImportPayload: latestMatchRadarImportPayload
          },
          mappingRevision
        })}
      </main>
    </div>
  );
}

export default App;
