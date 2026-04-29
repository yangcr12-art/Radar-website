import React, { useEffect, useMemo, useRef, useState } from "react";
import { checkHealth, deleteMatchDataset, fetchMatchDatasets, fetchMatchTeamById, fetchMatchTeamList, getApiBaseLabel, importMatchExcel } from "../../api/storageClient";
import { METRIC_GROUP_RULES, STORAGE_KEYS } from "../../app/constants";
import { readLocalStore, writeLocalStore, writeLocalStoreWithResult } from "../../utils/localStore";
import { getMatchProjectGroupByColumn, getMatchProjectZhByColumn } from "../../utils/matchProjectMappingStore";
import { getTeamMappingRowsByName, normalizeTeamName } from "../../utils/teamMappingStore";
import { formatDateTime } from "../../utils/timeFormat";

const GROUP_SORT_ORDER: Record<string, number> = {
  "进攻": 0,
  "其他": 1,
  "传球": 2,
  "对抗": 3,
  "防守": 4,
  "定位球": 5
};

const SCORE_COLUMN_ALIASES = [
  "goals",
  "goal",
  "goals scored",
  "进球",
  "进球数"
];

function formatColumnLabel(column) {
  const en = String(column || "").trim();
  const zh = getMatchProjectZhByColumn(en);
  if (zh) return zh;
  return en;
}

function inferMetricGroup(column, metricText = "") {
  const text = `${String(column || "")} ${String(metricText || "")}`.toLowerCase().trim();
  for (const rule of METRIC_GROUP_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return rule.group;
    }
  }
  return "其他";
}

function normalizeGroupName(group) {
  const text = String(group || "").trim().toLowerCase();
  if (!text) return "其他";
  if (["other", "others", "其他"].includes(text)) return "其他";
  if (["attack", "attacking", "进攻"].includes(text)) return "进攻";
  if (["defense", "defence", "defending", "防守"].includes(text)) return "防守";
  if (["duel", "duels", "对抗"].includes(text)) return "对抗";
  if (["pass", "passing", "传球"].includes(text)) return "传球";
  if (["set piece", "set pieces", "定位球", "定位球进攻"].includes(text)) return "定位球";
  return String(group || "").trim() || "其他";
}

function getGroupSortOrder(group) {
  const key = normalizeGroupName(group);
  return Object.prototype.hasOwnProperty.call(GROUP_SORT_ORDER, key) ? GROUP_SORT_ORDER[key] : 99;
}

function parseNumericValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").replace(/%/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function isScoreColumn(column, metric) {
  const candidates = [String(column || "").trim(), String(metric || "").trim()]
    .map((item) => item.toLowerCase())
    .filter(Boolean);
  return candidates.some((item) => SCORE_COLUMN_ALIASES.some((alias) => item === alias || item.includes(alias)));
}

const MATCH_DATE_COLUMN_KEYWORDS = [
  "match date",
  "date",
  "比赛日期",
  "日期",
  "kick off",
  "kick-off",
  "time",
  "时间"
];

function normalizeDateText(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+(\.\d+)?$/.test(raw) && raw.length <= 5) return "";
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return raw;
}

function extractMatchDateFromTeamDetail(teamDetail) {
  const columns = Array.isArray(teamDetail?.columns) ? teamDetail.columns : [];
  let firstColumnFallback = "";
  for (const item of columns) {
    const colName = String(item?.column || "").trim();
    const name = colName.toLowerCase();
    if (name === "team") continue;
    if (!firstColumnFallback) {
      const fallbackText = normalizeDateText(item?.value);
      if (fallbackText) firstColumnFallback = fallbackText;
    }
    if (!name) continue;
    if (!MATCH_DATE_COLUMN_KEYWORDS.some((kw) => name.includes(kw))) continue;
    const normalized = normalizeDateText(item?.value);
    if (normalized) return normalized;
  }
  return firstColumnFallback;
}

function buildTeamMetricMap(teamDetail) {
  const map = new Map<string, { column: string; raw: string; numeric: number; index: number }>();
  const columns = Array.isArray(teamDetail?.columns) ? teamDetail.columns : [];
  columns.forEach((item: any, index: number) => {
    const column = String(item?.column || "").trim();
    if (!column || String(column).toLowerCase() === "team") return;
    if (!item?.isNumeric) return;
    const raw = String(item?.value ?? "").trim();
    const numeric = parseNumericValue(raw);
    if (numeric === null) return;
    map.set(column, { column, raw, numeric, index });
  });
  return map;
}

function MatchTeamDataPage({
  mappingRevision = 0,
  matchMetricPresets = [],
  setMatchMetricPresets,
  selectedMatchMetricPresetByDataset = {},
  setSelectedMatchMetricPresetByDataset,
  onImportToMatchRadar,
  onMatchRadarImportPayload
}) {
  const apiBaseLabel = getApiBaseLabel();
  const [backendHealth, setBackendHealth] = useState("checking");
  const [dataMeta, setDataMeta] = useState({ teamCount: 0, updatedAt: "", numericColumns: [] as string[] });
  const [datasetOptions, setDatasetOptions] = useState([] as any[]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [teamOptions, setTeamOptions] = useState([] as any[]);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [selectedHomeTeamId, setSelectedHomeTeamId] = useState("");
  const [selectedAwayTeamId, setSelectedAwayTeamId] = useState("");
  const [selectedHomeTeamDetail, setSelectedHomeTeamDetail] = useState(null as any);
  const [selectedAwayTeamDetail, setSelectedAwayTeamDetail] = useState(null as any);
  const [matchDataLoading, setMatchDataLoading] = useState(false);
  const [matchDataImporting, setMatchDataImporting] = useState(false);
  const [matchDataMessage, setMatchDataMessage] = useState("");
  const [matchDataError, setMatchDataError] = useState("");
  const [detailReloadTick, setDetailReloadTick] = useState(0);
  const [metricSelectionsByDataset, setMetricSelectionsByDataset] = useState(() => readLocalStore(STORAGE_KEYS.matchMetricSelectionsByDataset, {}));
  const [teamSearchByDataset, setTeamSearchByDataset] = useState(() => readLocalStore(STORAGE_KEYS.matchTeamSearchByDataset, {}));
  const [homeTeamByDataset, setHomeTeamByDataset] = useState(() => readLocalStore(STORAGE_KEYS.matchHomeTeamByDataset, {}));
  const [awayTeamByDataset, setAwayTeamByDataset] = useState(() => readLocalStore(STORAGE_KEYS.matchAwayTeamByDataset, {}));
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const filteredTeamOptions = useMemo(() => {
    const keyword = teamSearchQuery.trim().toLowerCase();
    if (!keyword) return teamOptions;
    return teamOptions.filter((item) => String(item.team || "").toLowerCase().includes(keyword));
  }, [teamOptions, teamSearchQuery]);

  const homeTeamName = useMemo(() => {
    if (selectedHomeTeamDetail?.team) return String(selectedHomeTeamDetail.team);
    const found = teamOptions.find((item) => item.id === selectedHomeTeamId);
    return String(found?.team || "");
  }, [selectedHomeTeamDetail, teamOptions, selectedHomeTeamId]);

  const awayTeamName = useMemo(() => {
    if (selectedAwayTeamDetail?.team) return String(selectedAwayTeamDetail.team);
    const found = teamOptions.find((item) => item.id === selectedAwayTeamId);
    return String(found?.team || "");
  }, [selectedAwayTeamDetail, teamOptions, selectedAwayTeamId]);

  const teamNameMapping = useMemo(() => getTeamMappingRowsByName(), [mappingRevision]);

  const homeTeamDisplayName = useMemo(() => {
    const key = normalizeTeamName(homeTeamName).toLowerCase();
    const zh = String(teamNameMapping.get(key)?.zh || "").trim();
    return zh || homeTeamName;
  }, [homeTeamName, teamNameMapping]);

  const awayTeamDisplayName = useMemo(() => {
    const key = normalizeTeamName(awayTeamName).toLowerCase();
    const zh = String(teamNameMapping.get(key)?.zh || "").trim();
    return zh || awayTeamName;
  }, [awayTeamName, teamNameMapping]);

  const sharedMetricRows = useMemo(() => {
    const homeMap = buildTeamMetricMap(selectedHomeTeamDetail);
    const awayMap = buildTeamMetricMap(selectedAwayTeamDetail);
    const sharedColumns = [...homeMap.keys()].filter((column) => awayMap.has(column));

    return sharedColumns
      .map((column) => {
        const homeMetric = homeMap.get(column);
        const awayMetric = awayMap.get(column);
        const metric = String(getMatchProjectZhByColumn(column) || column).trim();
        const mappedGroup = String(getMatchProjectGroupByColumn(column) || "").trim();
        const group = normalizeGroupName(mappedGroup || inferMetricGroup(column, metric));
        return {
          column,
          metric,
          group,
          sourceIndex: Number(homeMetric?.index ?? 9999),
          homeRaw: String(homeMetric?.raw ?? ""),
          awayRaw: String(awayMetric?.raw ?? "")
        };
      })
      .sort((a, b) => {
        const groupDelta = getGroupSortOrder(a.group) - getGroupSortOrder(b.group);
        if (groupDelta !== 0) return groupDelta;
        const sourceDelta = Number(a.sourceIndex) - Number(b.sourceIndex);
        if (sourceDelta !== 0) return sourceDelta;
        return String(a.metric).localeCompare(String(b.metric), "zh-CN");
      });
  }, [selectedHomeTeamDetail, selectedAwayTeamDetail, mappingRevision]);

  const selectedMetricColumns = useMemo(() => {
    if (!selectedDatasetId) return [];
    const selected = Array.isArray(metricSelectionsByDataset[selectedDatasetId]) ? metricSelectionsByDataset[selectedDatasetId] : [];
    const availableSet = new Set(sharedMetricRows.map((row) => row.column));
    return selected.filter((col) => availableSet.has(col));
  }, [selectedDatasetId, metricSelectionsByDataset, sharedMetricRows]);

  const matchMetricPresetOptions = useMemo(() => matchMetricPresets, [matchMetricPresets]);

  const selectedMatchMetricPresetId = useMemo(() => {
    if (!selectedDatasetId) return "";
    const presetId = String(selectedMatchMetricPresetByDataset[selectedDatasetId] || "").trim();
    if (!presetId) return "";
    return matchMetricPresetOptions.some((item) => item.id === presetId) ? presetId : "";
  }, [selectedDatasetId, selectedMatchMetricPresetByDataset, matchMetricPresetOptions]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.matchMetricSelectionsByDataset, metricSelectionsByDataset);
  }, [metricSelectionsByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.matchTeamSearchByDataset, teamSearchByDataset);
  }, [teamSearchByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.matchHomeTeamByDataset, homeTeamByDataset);
  }, [homeTeamByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.matchAwayTeamByDataset, awayTeamByDataset);
  }, [awayTeamByDataset]);

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
    setMatchDataError("");
    try {
      const res = await fetchMatchDatasets();
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
      setMatchDataError(`数据集读取失败：${err.message}`);
      setDatasetOptions([]);
      setSelectedDatasetId("");
      return "";
    }
  };

  const loadTeamList = async (datasetId: string, preferredHomeTeamId = "", preferredAwayTeamId = "") => {
    setMatchDataLoading(true);
    setMatchDataError("");
    try {
      if (!datasetId) {
        setTeamOptions([]);
        setSelectedHomeTeamId("");
        setSelectedAwayTeamId("");
        setSelectedHomeTeamDetail(null);
        setSelectedAwayTeamDetail(null);
        setDataMeta({ teamCount: 0, updatedAt: "", numericColumns: [] });
        return;
      }

      const res = await fetchMatchTeamList(datasetId);
      const options = Array.isArray(res.teams) ? res.teams : [];
      setTeamOptions(options);
      setDataMeta({
        teamCount: Number(res.teamCount || options.length),
        updatedAt: res.updatedAt || "",
        numericColumns: Array.isArray(res.numericColumns) ? res.numericColumns : []
      });

      if (options.length === 0) {
        setSelectedHomeTeamId("");
        setSelectedAwayTeamId("");
        setSelectedHomeTeamDetail(null);
        setSelectedAwayTeamDetail(null);
        setDetailReloadTick((n) => n + 1);
        return;
      }

      const hasHome = preferredHomeTeamId && options.some((item) => item.id === preferredHomeTeamId);
      const hasAway = preferredAwayTeamId && options.some((item) => item.id === preferredAwayTeamId);
      const nextHome = hasHome ? preferredHomeTeamId : String(options[0]?.id || "");
      let nextAway = hasAway ? preferredAwayTeamId : String(options[1]?.id || options[0]?.id || "");
      if (nextAway === nextHome) {
        const other = options.find((item) => item.id !== nextHome);
        nextAway = String(other?.id || nextAway);
      }

      setSelectedHomeTeamId(nextHome);
      setSelectedAwayTeamId(nextAway);
      setDetailReloadTick((n) => n + 1);
    } catch (err: any) {
      setMatchDataError(`球队数据读取失败：${err.message}`);
      setTeamOptions([]);
      setSelectedHomeTeamId("");
      setSelectedAwayTeamId("");
      setSelectedHomeTeamDetail(null);
      setSelectedAwayTeamDetail(null);
    } finally {
      setMatchDataLoading(false);
    }
  };

  useEffect(() => {
    verifyBackendHealth();
    loadDatasets();
  }, []);

  useEffect(() => {
    if (!selectedDatasetId) return;
    setTeamSearchQuery(String(teamSearchByDataset[selectedDatasetId] || ""));
    const preferredHomeTeamId = String(homeTeamByDataset[selectedDatasetId] || "");
    const preferredAwayTeamId = String(awayTeamByDataset[selectedDatasetId] || "");
    loadTeamList(selectedDatasetId, preferredHomeTeamId, preferredAwayTeamId);
  }, [selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    setTeamSearchByDataset((prev) => (prev[selectedDatasetId] === teamSearchQuery ? prev : { ...prev, [selectedDatasetId]: teamSearchQuery }));
  }, [selectedDatasetId, teamSearchQuery]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    setHomeTeamByDataset((prev) => (prev[selectedDatasetId] === selectedHomeTeamId ? prev : { ...prev, [selectedDatasetId]: selectedHomeTeamId }));
  }, [selectedDatasetId, selectedHomeTeamId]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    setAwayTeamByDataset((prev) => (prev[selectedDatasetId] === selectedAwayTeamId ? prev : { ...prev, [selectedDatasetId]: selectedAwayTeamId }));
  }, [selectedDatasetId, selectedAwayTeamId]);

  useEffect(() => {
    const loadDetail = async (teamId: string, setDetail: (v: any) => void) => {
      if (!teamId || !selectedDatasetId) {
        setDetail(null);
        return;
      }
      try {
        const res = await fetchMatchTeamById(teamId, selectedDatasetId);
        setDetail(res.team || null);
      } catch {
        setDetail(null);
      }
    };

    loadDetail(selectedHomeTeamId, setSelectedHomeTeamDetail);
    loadDetail(selectedAwayTeamId, setSelectedAwayTeamDetail);
  }, [selectedHomeTeamId, selectedAwayTeamId, selectedDatasetId, detailReloadTick]);

  const onMatchExcelUploadClick = () => excelInputRef.current?.click();

  const onMatchExcelChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMatchDataImporting(true);
    setMatchDataMessage("");
    setMatchDataError("");
    try {
      const backendReady = await verifyBackendHealth();
      if (!backendReady) {
        throw new Error("后端未就绪：请先启动 player-web/server/app.py 并确认 /api/health 可访问");
      }
      const res = await importMatchExcel(file);
      setMatchDataMessage(`导入成功：${res.teamCount} 支球队，${res.numericColumnCount} 个数值列`);
      const nextDatasetId = await loadDatasets(String(res.datasetId || ""));
      await loadTeamList(nextDatasetId, "", "");
    } catch (err: any) {
      setMatchDataError(`导入失败：${err.message}`);
    } finally {
      setMatchDataImporting(false);
      event.target.value = "";
    }
  };

  const handleDeleteCurrentDataset = async () => {
    if (!selectedDatasetId) return;
    if (!window.confirm("确认删除当前导入数据集吗？删除后不可恢复。")) return;
    setMatchDataError("");
    setMatchDataMessage("");
    try {
      const res = await deleteMatchDataset(selectedDatasetId);
      const next = String(res.selectedDatasetId || "");
      await loadDatasets(next);
      await loadTeamList(next, "", "");
      setMatchDataMessage("已删除当前数据集。");
    } catch (err: any) {
      setMatchDataError(`删除数据集失败：${err.message}`);
    }
  };

  const handleHomeTeamChange = (teamId: string) => {
    if (!teamId) {
      setSelectedHomeTeamId("");
      return;
    }
    let nextAway = selectedAwayTeamId;
    if (teamId === selectedAwayTeamId) {
      const other = teamOptions.find((item) => item.id !== teamId);
      nextAway = String(other?.id || "");
    }
    setSelectedHomeTeamId(teamId);
    setSelectedAwayTeamId(nextAway);
  };

  const handleAwayTeamChange = (teamId: string) => {
    if (!teamId) {
      setSelectedAwayTeamId("");
      return;
    }
    let nextHome = selectedHomeTeamId;
    if (teamId === selectedHomeTeamId) {
      const other = teamOptions.find((item) => item.id !== teamId);
      nextHome = String(other?.id || "");
    }
    setSelectedHomeTeamId(nextHome);
    setSelectedAwayTeamId(teamId);
  };

  const handleToggleMetricColumn = (column: string) => {
    if (!selectedDatasetId) return;
    const availableSet = new Set(sharedMetricRows.map((row) => row.column));
    if (!availableSet.has(column)) return;
    setMetricSelectionsByDataset((prev) => {
      const current = Array.isArray(prev[selectedDatasetId]) ? prev[selectedDatasetId] : [];
      const next = current.includes(column) ? current.filter((item) => item !== column) : [...current, column];
      return { ...prev, [selectedDatasetId]: next };
    });
  };

  const handleSelectAllMetricColumns = () => {
    if (!selectedDatasetId) return;
    const columns = sharedMetricRows.map((row) => row.column);
    setSelectedMatchMetricPresetByDataset((prev) => {
      const nextMap = { ...prev };
      delete nextMap[selectedDatasetId];
      return nextMap;
    });
    setMetricSelectionsByDataset((prev) => ({ ...prev, [selectedDatasetId]: columns }));
  };

  const handleClearMetricColumns = () => {
    if (!selectedDatasetId) return;
    setSelectedMatchMetricPresetByDataset((prev) => {
      const nextMap = { ...prev };
      delete nextMap[selectedDatasetId];
      return nextMap;
    });
    setMetricSelectionsByDataset((prev) => ({ ...prev, [selectedDatasetId]: [] }));
  };

  const applyMatchMetricPreset = (presetId: string) => {
    if (!selectedDatasetId) return;
    setSelectedMatchMetricPresetByDataset((prev) => {
      const next = { ...prev };
      if (presetId) {
        next[selectedDatasetId] = presetId;
      } else {
        delete next[selectedDatasetId];
      }
      return next;
    });

    if (!presetId) {
      setMatchDataMessage("已取消球队指标预设选择。");
      setMatchDataError("");
      return;
    }

    const found = matchMetricPresetOptions.find((item) => item.id === presetId);
    if (!found) {
      setMatchDataError("未找到该球队指标预设。");
      setMatchDataMessage("");
      return;
    }

    const availableColumns = new Set(sharedMetricRows.map((row) => row.column));
    const validColumns = found.columns.filter((column) => availableColumns.has(column));
    if (validColumns.length === 0) {
      setMatchDataError("该预设在当前比赛数据集没有可用指标，未覆盖当前勾选。");
      setMatchDataMessage("");
      return;
    }

    setMetricSelectionsByDataset((prev) => ({ ...prev, [selectedDatasetId]: validColumns }));
    const skippedCount = found.columns.length - validColumns.length;
    setMatchDataMessage(skippedCount > 0 ? `已应用预设：${found.name}（忽略 ${skippedCount} 个失效指标）` : `已应用预设：${found.name}`);
    setMatchDataError("");
  };

  const handleSaveMatchMetricPreset = () => {
    if (!selectedDatasetId) {
      setMatchDataError("请先选择比赛数据集。");
      setMatchDataMessage("");
      return;
    }
    if (selectedMetricColumns.length === 0) {
      setMatchDataError("请先勾选至少一个球队指标后再保存预设。");
      setMatchDataMessage("");
      return;
    }
    const input = window.prompt("请输入球队指标预设名称：", "");
    if (input === null) return;
    const name = input.trim();
    if (!name) {
      setMatchDataError("预设名称不能为空。");
      setMatchDataMessage("");
      return;
    }
    const now = new Date().toISOString();
    const newPreset = {
      id: `match_metric_preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      columns: selectedMetricColumns,
      createdAt: now,
      updatedAt: now
    };
    setMatchMetricPresets((prev) => [newPreset, ...prev]);
    setSelectedMatchMetricPresetByDataset((prev) => ({ ...prev, [selectedDatasetId]: newPreset.id }));
    setMatchDataMessage(`已保存球队指标预设：${name}`);
    setMatchDataError("");
  };

  const handleRenameMatchMetricPreset = () => {
    if (!selectedDatasetId || !selectedMatchMetricPresetId) {
      setMatchDataError("请先选择一个球队指标预设。");
      setMatchDataMessage("");
      return;
    }
    const found = matchMetricPresetOptions.find((item) => item.id === selectedMatchMetricPresetId);
    if (!found) {
      setMatchDataError("未找到该球队指标预设。");
      setMatchDataMessage("");
      return;
    }
    const input = window.prompt("请输入新的预设名称：", found.name);
    if (input === null) return;
    const nextName = input.trim();
    if (!nextName) {
      setMatchDataError("预设名称不能为空。");
      setMatchDataMessage("");
      return;
    }
    setMatchMetricPresets((prev) =>
      prev
        .map((item) => (item.id === found.id ? { ...item, name: nextName, updatedAt: new Date().toISOString() } : item))
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    );
    setMatchDataMessage(`已重命名球队指标预设：${nextName}`);
    setMatchDataError("");
  };

  const handleDeleteMatchMetricPreset = () => {
    if (!selectedDatasetId || !selectedMatchMetricPresetId) {
      setMatchDataError("请先选择一个球队指标预设。");
      setMatchDataMessage("");
      return;
    }
    const found = matchMetricPresetOptions.find((item) => item.id === selectedMatchMetricPresetId);
    if (!found) {
      setMatchDataError("未找到该球队指标预设。");
      setMatchDataMessage("");
      return;
    }
    if (!window.confirm(`确认删除球队指标预设「${found.name}」吗？此操作不可撤销。`)) return;
    setMatchMetricPresets((prev) => prev.filter((item) => item.id !== found.id));
    setSelectedMatchMetricPresetByDataset((prev) =>
      Object.entries(prev).reduce((acc, [datasetId, presetId]) => {
        if (presetId !== found.id) acc[datasetId] = presetId;
        return acc;
      }, {} as Record<string, string>)
    );
    setMatchDataMessage(`已删除球队指标预设：${found.name}`);
    setMatchDataError("");
  };

  const handleImportSelectedMetricsToMatchRadar = () => {
    if (!selectedHomeTeamId || !selectedAwayTeamId) {
      setMatchDataError("请先选择主队和客队。");
      return;
    }
    if (selectedMetricColumns.length === 0) {
      setMatchDataError("请先勾选至少一个指标列。");
      return;
    }

    const selectedSet = new Set(selectedMetricColumns);
    const rows = sharedMetricRows
      .filter((row: any) => selectedSet.has(row.column))
      .map((row: any) => ({
        column: row.column,
        metric: row.metric,
        group: row.group,
        sourceIndex: Number(row.sourceIndex ?? 9999),
        homeRaw: row.homeRaw,
        awayRaw: row.awayRaw
      }));

    if (rows.length === 0) {
      setMatchDataError("当前勾选项没有可导入的数据。");
      return;
    }

    const scoreRow = sharedMetricRows.find((row: any) => isScoreColumn(row.column, row.metric));
    const homeScoreValue = parseNumericValue(scoreRow?.homeRaw);
    const awayScoreValue = parseNumericValue(scoreRow?.awayRaw);
    const homeScore = homeScoreValue === null ? "" : String(Math.round(homeScoreValue));
    const awayScore = awayScoreValue === null ? "" : String(Math.round(awayScoreValue));

    const payload = {
      importedAt: new Date().toISOString(),
      datasetId: selectedDatasetId,
      homeTeamId: selectedHomeTeamId,
      awayTeamId: selectedAwayTeamId,
      homeTeamName: homeTeamDisplayName || homeTeamName || "主队",
      awayTeamName: awayTeamDisplayName || awayTeamName || "客队",
      matchDateText: extractMatchDateFromTeamDetail(selectedHomeTeamDetail) || extractMatchDateFromTeamDetail(selectedAwayTeamDetail) || "",
      homeScore: homeScore && awayScore ? homeScore : "",
      awayScore: homeScore && awayScore ? awayScore : "",
      rows
    };

    const persistResult = writeLocalStoreWithResult(STORAGE_KEYS.matchRadarImportPayload, payload);
    if (typeof onMatchRadarImportPayload === "function") {
      onMatchRadarImportPayload(payload);
    }
    window.dispatchEvent(new CustomEvent("match-radar-imported", { detail: payload }));
    if (typeof onImportToMatchRadar === "function") {
      onImportToMatchRadar();
    }
    if (persistResult.ok) {
      setMatchDataMessage(`已导入 ${rows.length} 项到比赛雷达图。`);
      setMatchDataError("");
    } else {
      setMatchDataMessage(`已导入 ${rows.length} 项到比赛雷达图。`);
      setMatchDataError(`浏览器本地存储写入失败：${persistResult.error || persistResult.name || "未知错误"}。当前导入已生效，但刷新页面后可能不会保留。`);
    }
  };

  const backendOnline = backendHealth === "online";

  return (
    <section className="info-page">
      <div className="info-card player-data-layout match-team-data-layout">
        <div className="player-data-left">
          <h1>球队数据</h1>
          <p>导入 Excel（.xlsx）后写入比赛总结独立数据域，仅用于比赛雷达图。</p>
          <p>{`当前数据集球队数：${dataMeta.teamCount || 0}`}</p>
          <p>{`最近更新时间：${formatDateTime(dataMeta.updatedAt) || "-"}`}</p>

          <div className="title-row">
            <label>导入数据集</label>
            <select value={selectedDatasetId} onChange={(e) => setSelectedDatasetId(e.target.value)} disabled={datasetOptions.length === 0}>
              {datasetOptions.length === 0 ? <option value="">暂无已导入数据集</option> : null}
              {datasetOptions.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="btn-row">
            <button onClick={onMatchExcelUploadClick} disabled={matchDataImporting || !backendOnline}>
              {matchDataImporting ? "导入中..." : backendOnline ? "导入 Excel（需 Team 列）" : "后端未连接"}
            </button>
            <button onClick={handleDeleteCurrentDataset} disabled={!selectedDatasetId || matchDataImporting}>
              删除当前数据集
            </button>
            <input ref={excelInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden-file" onChange={onMatchExcelChange} />
          </div>

          <div className="title-row">
            <label>搜索球队</label>
            <input placeholder="输入球队名关键字" value={teamSearchQuery} onChange={(e) => setTeamSearchQuery(e.target.value)} disabled={teamOptions.length === 0} />
          </div>

          <div className="match-radar-grid-2">
            <div className="title-row">
              <label>主队</label>
              <select value={selectedHomeTeamId} onChange={(e) => handleHomeTeamChange(e.target.value)} disabled={filteredTeamOptions.length === 0}>
                {teamOptions.length === 0 ? <option value="">暂无球队数据</option> : null}
                {teamOptions.length > 0 && filteredTeamOptions.length === 0 ? <option value="">无匹配球队</option> : null}
                {filteredTeamOptions.map((item: any) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.team}
                  </option>
                ))}
              </select>
            </div>
            <div className="title-row">
              <label>客队</label>
              <select value={selectedAwayTeamId} onChange={(e) => handleAwayTeamChange(e.target.value)} disabled={filteredTeamOptions.length === 0}>
                {teamOptions.length === 0 ? <option value="">暂无球队数据</option> : null}
                {teamOptions.length > 0 && filteredTeamOptions.length === 0 ? <option value="">无匹配球队</option> : null}
                {filteredTeamOptions.map((item: any) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.team}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!backendOnline ? <p className="msg err">{`导入已禁用：后端未连接（当前 API：${apiBaseLabel}）`}</p> : null}
          {matchDataMessage ? <p className="msg ok">{matchDataMessage}</p> : null}
          {matchDataError ? <p className="msg err">{matchDataError}</p> : null}
        </div>

        <div className="player-data-right">
          <p className="selected-player-title">{`当前对阵：${homeTeamDisplayName || homeTeamName || "-"} vs ${awayTeamDisplayName || awayTeamName || "-"}`}</p>
          <div className="player-export-section player-export-inline">
            <p className="meta-title">勾选指标并导入到比赛雷达图（原始值对比）</p>
            <p>{`已勾选：${selectedMetricColumns.length}/${sharedMetricRows.length || 0}`}</p>
            <div className="player-metric-preset-actions">
              <div className="player-metric-preset-row">
                <label>球队指标预设</label>
                <select value={selectedMatchMetricPresetId} onChange={(e) => applyMatchMetricPreset(e.target.value)} disabled={!selectedDatasetId}>
                  <option value="">{matchMetricPresetOptions.length === 0 ? "暂无可复用预设" : "不使用预设"}</option>
                  {matchMetricPresetOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {`${item.name}${item.columns?.length ? ` (${item.columns.length})` : ""}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="btn-row player-metric-preset-btn-row">
                <button onClick={handleSaveMatchMetricPreset} disabled={selectedMetricColumns.length === 0}>
                  保存为预设
                </button>
                <button onClick={handleRenameMatchMetricPreset} disabled={!selectedMatchMetricPresetId}>
                  预设改名
                </button>
                <button onClick={handleDeleteMatchMetricPreset} disabled={!selectedMatchMetricPresetId}>
                  删除预设
                </button>
              </div>
            </div>
            <div className="btn-row">
              <button onClick={handleSelectAllMetricColumns} disabled={!selectedDatasetId || sharedMetricRows.length === 0}>
                全选指标
              </button>
              <button onClick={handleClearMetricColumns} disabled={!selectedDatasetId || sharedMetricRows.length === 0}>
                清空勾选
              </button>
              <button
                onClick={handleImportSelectedMetricsToMatchRadar}
                disabled={matchDataLoading || !selectedHomeTeamId || !selectedAwayTeamId || selectedMetricColumns.length === 0}
              >
                一键导入到比赛雷达图
              </button>
            </div>
          </div>

          <div className="player-data-table-wrap">
            <table className="match-team-data-table">
              <thead>
                <tr>
                  <th>勾选</th>
                  <th>列标题</th>
                  <th>group</th>
                  <th>{homeTeamDisplayName || homeTeamName || "主队"}</th>
                  <th>{awayTeamDisplayName || awayTeamName || "客队"}</th>
                </tr>
              </thead>
              <tbody>
                {matchDataLoading ? (
                  <tr>
                    <td colSpan={5}>加载中...</td>
                  </tr>
                ) : null}

                {!matchDataLoading && sharedMetricRows.length > 0
                  ? sharedMetricRows.map((row: any) => (
                      <tr key={row.column}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedMetricColumns.includes(row.column)}
                            onChange={() => handleToggleMetricColumn(row.column)}
                            disabled={!selectedDatasetId}
                          />
                        </td>
                        <td>{formatColumnLabel(row.column)}</td>
                        <td>{row.group || "-"}</td>
                        <td>{row.homeRaw || "-"}</td>
                        <td>{row.awayRaw || "-"}</td>
                      </tr>
                    ))
                  : null}

                {!matchDataLoading && sharedMetricRows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>暂无共同数值指标，请先选择主客队并确认数据有效。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MatchTeamDataPage;
