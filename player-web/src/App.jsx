import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  deletePlayerDataset,
  fetchPlayerById,
  fetchPlayerDatasets,
  fetchPlayerList,
  fetchState,
  importPlayerExcel,
  migrateFromLocal,
  saveState
} from "./api/storageClient";
import AboutPage from "./pages/about/AboutPage";
import HomePage from "./pages/home/HomePage";
import PlayerDataPage from "./pages/player-data/PlayerDataPage";
import ProjectMappingPage from "./pages/project-mapping/ProjectMappingPage";
import { getProjectGroupByColumn, getProjectGroupOrder, getProjectZhByColumn } from "./utils/projectMappingStore";
const DEFAULT_TIER_COLORS = {
  elite: "#0099FF",
  above_avg: "#16a34a",
  avg: "#f2b700",
  bottom: "#d32f2f"
};

const TIER_LABELS = {
  elite: "顶级",
  above_avg: "良好",
  avg: "中等",
  bottom: "较弱"
};
const TIER_ALIASES = {
  elite: "elite",
  顶级: "elite",
  above_avg: "above_avg",
  良好: "above_avg",
  avg: "avg",
  中等: "avg",
  bottom: "bottom",
  较弱: "bottom"
};
const HEADER_ALIASES = {
  metric: "metric",
  指标: "metric",
  value: "value",
  百分比: "value",
  百分位: "value",
  group: "group",
  分组: "group",
  order: "order",
  顺序: "order",
  subOrder: "subOrder",
  groupOrder: "subOrder",
  intraOrder: "subOrder",
  组内顺序: "subOrder",
  组内排序: "subOrder",
  per90: "per90",
  每90: "per90",
  tier: "tier",
  层级: "tier",
  color: "color",
  颜色: "color"
};

const INITIAL_ROWS = [
  { metric: "Long Pass %", group: "Passing", value: 71.43, per90: "", tier: "elite", order: 1, color: "" },
  { metric: "Cross + Smart Complete %", group: "Passing", value: 33.33, per90: "", tier: "above_avg", order: 1, color: "" },
  { metric: "Short & Med Pass %", group: "Passing", value: 76.72, per90: "", tier: "above_avg", order: 1, color: "" },
  { metric: "Aerial Win %", group: "Defending", value: 44.0, per90: "", tier: "elite", order: 2, color: "" },
  { metric: "Tackles + Int (PAdj)", group: "Defending", value: 57.0, per90: "2.57", tier: "above_avg", order: 2, color: "" },
  { metric: "Defensive Actions", group: "Defending", value: 64.0, per90: "3.57", tier: "above_avg", order: 2, color: "" },
  { metric: "Prog Pass", group: "Progression", value: 48.0, per90: "2.08", tier: "above_avg", order: 3, color: "" },
  { metric: "Prog Carry", group: "Progression", value: 36.0, per90: "1.33", tier: "above_avg", order: 3, color: "" },
  { metric: "Dribble Success %", group: "Progression", value: 56.0, per90: "0.34", tier: "elite", order: 3, color: "" },
  { metric: "Touches in Pen", group: "Shooting", value: 18.0, per90: "2.48", tier: "bottom", order: 4, color: "" },
  { metric: "npxG per Shot", group: "Shooting", value: 28.0, per90: "2.11", tier: "above_avg", order: 4, color: "" },
  { metric: "Shots", group: "Shooting", value: 23.53, per90: "0.18", tier: "elite", order: 4, color: "" },
  { metric: "Goals/Shot on Target %", group: "Shooting", value: 50.0, per90: "0.50", tier: "elite", order: 4, color: "" },
  { metric: "npxG", group: "Shooting", value: 38.0, per90: "0.38", tier: "above_avg", order: 4, color: "" },
  { metric: "Second Assists", group: "Creation", value: 66.0, per90: "0.06", tier: "elite", order: 5, color: "" },
  { metric: "Smart Passes", group: "Creation", value: 12.0, per90: "0.00", tier: "bottom", order: 5, color: "" },
  { metric: "xA per Assist", group: "Creation", value: 6.0, per90: "0.06", tier: "bottom", order: 5, color: "" },
  { metric: "Expected Assists", group: "Creation", value: 3.0, per90: "0.03", tier: "bottom", order: 5, color: "" },
  { metric: "Assists", group: "Creation", value: 8.0, per90: "0.53", tier: "bottom", order: 5, color: "" }
];

const REQUIRED_COLUMNS = ["metric", "value", "group", "order"];
const OPTIONAL_COLUMNS = ["subOrder", "per90", "tier", "color"];
const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
const FONT_OPTIONS = [
  { label: "苹方 / PingFang", value: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif' },
  { label: "微软雅黑 / YaHei", value: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif' },
  { label: "思源黑体 / Noto Sans SC", value: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: "宋体 / SimSun", value: '"SimSun", "Songti SC", serif' },
  { label: "系统无衬线", value: 'system-ui, -apple-system, "Segoe UI", sans-serif' }
];
const STORAGE_KEYS = {
  draft: "player_web_current_draft_v1",
  presets: "player_web_saved_presets_v1",
  selectedPresetId: "player_web_selected_preset_id_v1",
  localMigrated: "player_web_local_migrated_to_backend_v1",
  metricSelectionsByDataset: "player_web_metric_selection_by_dataset_v1",
  playerSearchByDataset: "player_web_player_search_by_dataset_v1",
  selectedPlayerByDataset: "player_web_selected_player_by_dataset_v1"
};
const REORDER_MODE_VIEW = "view";
const REORDER_MODE_ORDER = "order";
const NAV_ITEMS = [
  { key: "home", label: "主页" },
  { key: "radar", label: "雷达图生成器" },
  { key: "player_data", label: "球员数据" },
  { key: "project_mapping", label: "项目对应表" },
  { key: "about", label: "About" }
];
const METRIC_GROUP_RULES = [
  { group: "对抗", order: 2, keywords: ["duel", "aerial", "对抗", "空中对抗"] },
  { group: "防守", order: 3, keywords: ["def", "tackle", "interception", "foul", "防守", "抢断", "拦截", "犯规", "padj"] },
  { group: "传球", order: 1, keywords: ["pass", "cross", "assist", "progressive pass", "传球", "长传", "关键传球", "向前传球", "推进传球"] }
];
const DEFAULT_META = {
  player: "Alberto Quiles Piosa",
  age: "30",
  position: "CF",
  minutes: "2901",
  club: "Tianjin Tigers",
  league: "Chinese Super League",
  season: "2025"
};
const DEFAULT_TEXT_STYLE = {
  fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  titleSize: 28,
  subtitleSize: 16,
  metricSize: 14,
  groupSize: 16,
  per90Size: 12,
  tickSize: 12,
  legendSize: 14
};
const DEFAULT_CHART_STYLE = {
  ringStrokeWidth: 1,
  innerRingStrokeWidth: 2,
  ringLineStyle: "dashed",
  ringDasharray: "4 8",
  groupLabelRadius: 540,
  groupLabelOffsetX: 0,
  groupLabelOffsetY: 0
};
const DEFAULT_CENTER_IMAGE = {
  src: "",
  scale: 1
};
const DEFAULT_CORNER_IMAGE = {
  src: "",
  size: 130,
  x: 60,
  y: 120
};

const CANVAS_WIDTH = 1240;
const CANVAS_HEIGHT = 1240;
const CENTER_X = 620;
const CENTER_Y = 660;
const INNER_RING = 118;
const MAX_RADIAL_LENGTH = 320;
const METRIC_LABEL_RADIUS = INNER_RING + MAX_RADIAL_LENGTH + 30;
const BAR_INNER_GAP = 6;

function polarPoint(radius, angle) {
  return {
    x: CENTER_X + radius * Math.cos(angle),
    y: CENTER_Y + radius * Math.sin(angle)
  };
}

function sectorPolygon(a0, a1, r0, r1) {
  const p1 = polarPoint(r0, a0);
  const p2 = polarPoint(r1, a0);
  const p3 = polarPoint(r1, a1);
  const p4 = polarPoint(r0, a1);
  return `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`;
}

function annularSectorPath(a0, a1, rInner, rOuter) {
  const outerStart = polarPoint(rOuter, a0);
  const outerEnd = polarPoint(rOuter, a1);
  const innerEnd = polarPoint(rInner, a1);
  const innerStart = polarPoint(rInner, a0);
  const largeArc = a1 - a0 > Math.PI ? 1 : 0;

  return [
    `M ${innerStart.x} ${innerStart.y}`,
    `L ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z"
  ].join(" ");
}

function colorToAlpha(hex, alpha = 0.22) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      cells.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  cells.push(cur);
  return cells;
}

function parseCsv(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return { rows: [], error: "CSV 至少要包含表头和一行数据。" };
  }

  const rawHeaders = splitCsvLine(lines[0]).map((h) => h.trim());
  const headers = rawHeaders.map((h) => HEADER_ALIASES[h] || h);
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    return { rows: [], error: `缺少必填列: ${missing.join(", ")}` };
  }

  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const cells = splitCsvLine(lines[i]);

    const metric = (cells[idx.metric] || "").trim();
    const group = (cells[idx.group] || "").trim();
    const valueRaw = (cells[idx.value] || "").trim();
    const orderRaw = (cells[idx.order] || "").trim();

    const value = Number(valueRaw);
    const order = Number(orderRaw);

    if (!metric) return { rows: [], error: `第 ${lineNo} 行 metric 不能为空` };
    if (!group) return { rows: [], error: `第 ${lineNo} 行 group 不能为空` };
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { rows: [], error: `第 ${lineNo} 行 value 必须在 0-100` };
    }
    if (!Number.isInteger(order)) {
      return { rows: [], error: `第 ${lineNo} 行 order 必须是整数` };
    }

    const tierRaw = (cells[idx.tier] || "avg").trim();
    const tier = TIER_ALIASES[tierRaw.toLowerCase()] || TIER_ALIASES[tierRaw] || "avg";
    const subOrderRaw = idx.subOrder === undefined ? "" : (cells[idx.subOrder] || "").trim();
    const parsedSubOrder = Number(subOrderRaw);
    const subOrder = Number.isInteger(parsedSubOrder) && parsedSubOrder > 0 ? parsedSubOrder : null;

    rows.push({
      metric,
      group,
      value,
      order,
      subOrder,
      per90: (cells[idx.per90] || "").trim(),
      tier,
      color: (cells[idx.color] || "").trim()
    });
  }

  return { rows: recomputeRowsTier(rows), error: "" };
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  const header = ALL_COLUMNS.join(",");
  const body = rows
    .map((row) =>
      [
        row.metric,
        row.value,
        row.group,
        row.order,
        row.subOrder,
        row.per90,
        row.tier,
        row.color
      ]
        .map((v) => escapeCsvCell(v))
        .join(",")
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

function computeTierFromValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "avg";
  if (num >= 90) return "elite";
  if (num >= 65) return "above_avg";
  if (num >= 34) return "avg";
  return "bottom";
}

function recomputeRowsTier(rows) {
  const groupCounter = new Map();
  return rows.map((row) => {
    const groupKey = String(row.group || "");
    const subOrderNum = Number(row.subOrder);
    let subOrder = Number.isInteger(subOrderNum) && subOrderNum > 0 ? subOrderNum : null;
    if (subOrder == null) {
      const next = Number(groupCounter.get(groupKey) || 0) + 1;
      subOrder = next;
    }
    groupCounter.set(groupKey, Number(subOrder));
    return {
      ...row,
      subOrder: Number(subOrder),
      tier: computeTierFromValue(row.value)
    };
  });
}

function readStorage(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallbackValue;
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function normalizePresets(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        item.payload &&
        typeof item.payload === "object"
    )
    .map((item) => ({
      ...item,
      payload: normalizeSnapshot(item.payload)
    }))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return {
      title: "Player Radar (Template Mode)",
      subtitle: "Input metric CSV and export image",
      rows: INITIAL_ROWS,
      rowReorderMode: REORDER_MODE_ORDER,
      meta: DEFAULT_META,
      textStyle: DEFAULT_TEXT_STYLE,
      chartStyle: DEFAULT_CHART_STYLE,
      centerImage: DEFAULT_CENTER_IMAGE,
      cornerImage: DEFAULT_CORNER_IMAGE
    };
  }

  const normalizedRows = Array.isArray(snapshot.rows) ? recomputeRowsTier(snapshot.rows) : recomputeRowsTier(INITIAL_ROWS);
  const centerImage = snapshot.centerImage && typeof snapshot.centerImage === "object"
    ? {
        src: typeof snapshot.centerImage.src === "string" ? snapshot.centerImage.src : "",
        scale: Number.isFinite(Number(snapshot.centerImage.scale)) ? Number(snapshot.centerImage.scale) : 1
      }
    : DEFAULT_CENTER_IMAGE;
  const cornerImage = snapshot.cornerImage && typeof snapshot.cornerImage === "object"
    ? {
        src: typeof snapshot.cornerImage.src === "string" ? snapshot.cornerImage.src : "",
        size: Number.isFinite(Number(snapshot.cornerImage.size)) ? Number(snapshot.cornerImage.size) : DEFAULT_CORNER_IMAGE.size,
        x: Number.isFinite(Number(snapshot.cornerImage.x)) ? Number(snapshot.cornerImage.x) : DEFAULT_CORNER_IMAGE.x,
        y: Number.isFinite(Number(snapshot.cornerImage.y)) ? Number(snapshot.cornerImage.y) : DEFAULT_CORNER_IMAGE.y
      }
    : DEFAULT_CORNER_IMAGE;
  return {
    title: snapshot.title ?? "Player Radar (Template Mode)",
    subtitle: snapshot.subtitle ?? "Input metric CSV and export image",
    rows: normalizedRows,
    rowReorderMode: snapshot.rowReorderMode === REORDER_MODE_VIEW ? REORDER_MODE_VIEW : REORDER_MODE_ORDER,
    meta: { ...DEFAULT_META, ...(snapshot.meta || {}) },
    textStyle: { ...DEFAULT_TEXT_STYLE, ...(snapshot.textStyle || {}) },
    chartStyle: { ...DEFAULT_CHART_STYLE, ...(snapshot.chartStyle || {}) },
    centerImage,
    cornerImage
  };
}

function normalizePersistedState(input) {
  if (!input || typeof input !== "object") {
    return {
      draft: normalizeSnapshot(null),
      presets: [],
      selectedPresetId: "draft"
    };
  }

  const draft = normalizeSnapshot(input.draft);
  const presets = normalizePresets(input.presets);
  const selected = typeof input.selectedPresetId === "string" ? input.selectedPresetId : "draft";
  const selectedPresetId = selected === "draft" || presets.some((item) => item.id === selected) ? selected : "draft";

  return { draft, presets, selectedPresetId };
}

function formatPresetTime(isoText) {
  if (!isoText) return "";
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatDateTime(isoText) {
  if (!isoText) return "";
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function formatPlayerDataColumnLabel(column) {
  const en = String(column || "").trim();
  const zh = getProjectZhByColumn(en);
  if (zh && en && zh !== en) return `${zh} (${en})`;
  return en || column;
}

function getColumnZhFromProjectMapping(column) {
  return getProjectZhByColumn(column);
}

function stripPer90Text(text) {
  return String(text || "")
    .replace(/每90分钟/g, "")
    .replace(/\s*per\s*90/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getMetricDisplayNameFromColumn(column) {
  const mapped = getColumnZhFromProjectMapping(column);
  if (mapped) {
    return stripPer90Text(mapped);
  }
  return stripPer90Text(column);
}

function inferMetricGroupAndOrder(column, metricText = "") {
  const text = `${String(column || "")} ${String(metricText || "")}`.toLowerCase().trim();
  for (const rule of METRIC_GROUP_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return { group: rule.group, order: rule.order };
    }
  }
  return { group: "其他", order: 4 };
}

function App() {
  const [activePage, setActivePage] = useState("radar");
  const [title, setTitle] = useState("Player Radar (Template Mode)");
  const [subtitle, setSubtitle] = useState("Input metric CSV and export image");
  const [rows, setRows] = useState(() => recomputeRowsTier(INITIAL_ROWS));
  const [rowReorderMode, setRowReorderMode] = useState(REORDER_MODE_ORDER);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [csvText, setCsvText] = useState("");
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
  const [playerDetailReloadTick, setPlayerDetailReloadTick] = useState(0);
  const [metricSelectionsByDataset, setMetricSelectionsByDataset] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.metricSelectionsByDataset, {});
    return raw && typeof raw === "object" ? raw : {};
  });
  const [playerSearchByDataset, setPlayerSearchByDataset] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.playerSearchByDataset, {});
    return raw && typeof raw === "object" ? raw : {};
  });
  const [selectedPlayerByDataset, setSelectedPlayerByDataset] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.selectedPlayerByDataset, {});
    return raw && typeof raw === "object" ? raw : {};
  });
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

      let next =
        rowReorderMode === REORDER_MODE_ORDER
          ? prev.map((row) => ({ ...row }))
          : [...prev];

      const sourceSubOrder = Number(next[index].subOrder);
      const normalizedSubOrder = Number.isFinite(sourceSubOrder) ? Math.max(1, Math.floor(sourceSubOrder)) : 1;
      next[index] = {
        ...next[index],
        subOrder: Math.max(1, normalizedSubOrder + direction)
      };

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
      return next;
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

  const importCsvFromTextarea = () => {
    if (!csvText.trim()) {
      setError("请先粘贴 CSV 文本。");
      setMessage("");
      return;
    }
    importCsvText(csvText);
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
    setPlayerDataError("");
    setPlayerDataMessage("");
    try {
      const res = await deletePlayerDataset(selectedDatasetId);
      const next = String(res.selectedDatasetId || "");
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
    setMetricSelectionsByDataset((prev) => {
      const current = Array.isArray(prev[selectedDatasetId]) ? prev[selectedDatasetId] : [];
      const next = current.includes(column) ? current.filter((item) => item !== column) : [...current, column];
      return { ...prev, [selectedDatasetId]: next };
    });
  };

  const handleSelectAllMetricColumns = () => {
    if (!selectedDatasetId) return;
    const numericColumns = Array.isArray(playerDataMeta.numericColumns) ? playerDataMeta.numericColumns : [];
    setMetricSelectionsByDataset((prev) => ({ ...prev, [selectedDatasetId]: numericColumns }));
  };

  const handleClearMetricColumns = () => {
    if (!selectedDatasetId) return;
    setMetricSelectionsByDataset((prev) => ({ ...prev, [selectedDatasetId]: [] }));
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
    const nextRows = selectedMetricColumns
      .map((column, index) => {
        const detail = detailMap.get(column);
        if (!detail) return null;
        const percentile = Number(detail.percentile);
        if (!Number.isFinite(percentile)) return null;
        const value = Math.max(0, Math.min(100, Number(percentile.toFixed(2))));
        const metric = getMetricDisplayNameFromColumn(column);
        const mappedGroup = getProjectGroupByColumn(column);
        const fallback = inferMetricGroupAndOrder(column, metric);
        const group = mappedGroup || fallback.group;
        const order = mappedGroup ? getProjectGroupOrder(mappedGroup) : fallback.order;
        return {
          metric,
          value,
          group,
          order,
          subOrder: index + 1,
          per90: String(detail.value ?? ""),
          tier: computeTierFromValue(value),
          color: "",
          _index: index
        };
      })
      .filter(Boolean);

    if (nextRows.length === 0) {
      setPlayerDataError("当前勾选列没有可用百分比数据，请更换球员或勾选项。");
      return;
    }

    nextRows.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a._index - b._index;
    });
    const groupCounter = new Map();
    const finalRows = nextRows.map(({ _index, ...item }) => {
      const groupKey = String(item.group || "");
      const nextSubOrder = Number(groupCounter.get(groupKey) || 0) + 1;
      groupCounter.set(groupKey, nextSubOrder);
      return { ...item, subOrder: nextSubOrder };
    });

    setRows(finalRows);
    setMeta((prev) => ({
      ...prev,
      player: selectedPlayerDetail.player || prev.player
    }));
    setActivePage("radar");
    setPlayerDataError("");
    setPlayerDataMessage("");
    setError("");
    setMessage(`已导入 ${finalRows.length} 个指标到雷达图生成器。`);
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
    if (field === "ringLineStyle" || field === "ringDasharray") {
      setChartStyle((prev) => ({ ...prev, [field]: value }));
      return;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const safe =
      field === "ringStrokeWidth" || field === "innerRingStrokeWidth"
        ? Math.min(8, Number(num.toFixed(1)))
        : Number(num.toFixed(1));
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

  const getPersistedState = (snapshot = getSnapshot(), presetList = presets, selectedId = selectedPresetId) => ({
    draft: snapshot,
    presets: presetList,
    selectedPresetId: selectedId
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
  };

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const localRawDraft = readStorage(STORAGE_KEYS.draft, null);
      const localRawPresets = readStorage(STORAGE_KEYS.presets, []);
      const localRawSelected = readStorage(STORAGE_KEYS.selectedPresetId, "draft");
      const localPersisted = normalizePersistedState({
        draft: localRawDraft,
        presets: localRawPresets,
        selectedPresetId: localRawSelected
      });
      const hasLocalSaved =
        Boolean(localRawDraft) ||
        (Array.isArray(localRawPresets) && localRawPresets.length > 0) ||
        localRawSelected !== "draft";

      try {
        const remote = await fetchState();
        if (cancelled) return;

        if (remote?.data) {
          applyPersistedState(remote.data);
          setStorageStatus("online");
        } else if (hasLocalSaved && !readStorage(STORAGE_KEYS.localMigrated, false)) {
          const migrated = await migrateFromLocal(localPersisted);
          if (cancelled) return;
          if (migrated?.migrated) {
            writeStorage(STORAGE_KEYS.localMigrated, true);
            const migratedState = await fetchState();
            if (cancelled) return;
            if (migratedState?.data) {
              applyPersistedState(migratedState.data);
            } else {
              applyPersistedState(localPersisted);
            }
            setMessage("已将本地历史数据迁移到后端。");
          } else {
            applyPersistedState(localPersisted);
          }
          setStorageStatus("online");
        } else {
          applyPersistedState(localPersisted);
          setStorageStatus("online");
        }
      } catch {
        if (cancelled) return;
        applyPersistedState(localPersisted);
        setStorageStatus("offline");
      } finally {
        if (cancelled) return;
        setIsHydrated(true);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const snapshot = getSnapshot();
    const okDraft = writeStorage(STORAGE_KEYS.draft, snapshot);
    const okSelected = writeStorage(STORAGE_KEYS.selectedPresetId, selectedPresetId);
    const okPresets = writeStorage(STORAGE_KEYS.presets, presets);
    if (!okDraft || !okSelected || !okPresets) {
      setError("本地缓存写入失败。");
    }
  }, [title, subtitle, rows, rowReorderMode, meta, textStyle, chartStyle, centerImage, cornerImage, selectedPresetId, presets, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeStorage(STORAGE_KEYS.metricSelectionsByDataset, metricSelectionsByDataset);
  }, [metricSelectionsByDataset, isHydrated]);

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
  }, [title, subtitle, rows, rowReorderMode, meta, textStyle, chartStyle, centerImage, cornerImage, presets, selectedPresetId, isHydrated]);

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
    setPlayerSearchByDataset((prev) => {
      if (prev[selectedDatasetId] === playerSearchQuery) return prev;
      return { ...prev, [selectedDatasetId]: playerSearchQuery };
    });
  }, [selectedDatasetId, playerSearchQuery]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    setSelectedPlayerByDataset((prev) => {
      if (prev[selectedDatasetId] === selectedPlayerId) return prev;
      return { ...prev, [selectedDatasetId]: selectedPlayerId };
    });
  }, [selectedDatasetId, selectedPlayerId]);

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
    const titleText = `${meta.player} (${meta.age}, ${meta.position}, ${meta.minutes} mins.), ${meta.club}`;
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
      setCornerImage((prev) => ({ ...prev, src }));
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
      ctx.fillStyle = "#f8f5ef";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = "player_radar.png";
      a.click();
    };
    image.src = url;
  };

  const radarPage = (
    <div className="page">
      <div className="left-panel">
        <h1>球员雷达图网页生成器</h1>

        <div className="title-row">
          <label>主标题</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="title-row">
          <label>副标题</label>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </div>

        <div className="save-section">
          <p className="meta-title">保存与版本切换</p>
          <div className="save-grid">
            <input
              placeholder="输入版本名，例如：武磊-2025"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <button onClick={handleSavePreset}>保存当前为版本</button>
            <select value={selectedPresetId} onChange={(e) => handleSwitchPreset(e.target.value)}>
              <option value="draft">当前草稿（自动保存）</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {`${preset.name}${formatPresetTime(preset.updatedAt) ? ` · ${formatPresetTime(preset.updatedAt)}` : ""}`}
                </option>
              ))}
            </select>
            <button onClick={handleDeletePreset} disabled={selectedPresetId === "draft"}>
              删除当前版本
            </button>
          </div>
        </div>

        <div className="meta-section">
          <button type="button" className="section-toggle" onClick={() => setTitlePanelOpen((prev) => !prev)}>
            <span>标题模板（可选）</span>
            <span>{titlePanelOpen ? "▾" : "▸"}</span>
          </button>
          {titlePanelOpen ? (
            <div className="section-body">
              <div className="meta-grid">
                <input placeholder="球员名" value={meta.player} onChange={(e) => updateMeta("player", e.target.value)} />
                <input placeholder="年龄" value={meta.age} onChange={(e) => updateMeta("age", e.target.value)} />
                <input placeholder="位置" value={meta.position} onChange={(e) => updateMeta("position", e.target.value)} />
                <input placeholder="分钟" value={meta.minutes} onChange={(e) => updateMeta("minutes", e.target.value)} />
                <input placeholder="球队" value={meta.club} onChange={(e) => updateMeta("club", e.target.value)} />
                <input placeholder="联赛" value={meta.league} onChange={(e) => updateMeta("league", e.target.value)} />
                <input placeholder="赛季(如2025)" value={meta.season} onChange={(e) => updateMeta("season", e.target.value)} />
              </div>
              <button onClick={applyTitleTemplate}>应用标题模板</button>
            </div>
          ) : null}
        </div>

        <div className="style-section">
          <button type="button" className="section-toggle" onClick={() => setFontPanelOpen((prev) => !prev)}>
            <span>图表样式</span>
            <span>{fontPanelOpen ? "▾" : "▸"}</span>
          </button>
          {fontPanelOpen ? (
            <div className="section-body">
              <div className="style-grid">
                <label>字体</label>
                <select value={textStyle.fontFamily} onChange={(e) => updateTextStyle("fontFamily", e.target.value)}>
                  {FONT_OPTIONS.map((font) => (
                    <option key={font.label} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                </select>

                <label>主标题字号</label>
                <input type="number" max="48" value={textStyle.titleSize} onChange={(e) => updateTextStyle("titleSize", e.target.value)} />

                <label>副标题字号</label>
                <input type="number" max="48" value={textStyle.subtitleSize} onChange={(e) => updateTextStyle("subtitleSize", e.target.value)} />

                <label>指标字号</label>
                <input type="number" max="48" value={textStyle.metricSize} onChange={(e) => updateTextStyle("metricSize", e.target.value)} />

                <label>分组字号</label>
                <input type="number" max="48" value={textStyle.groupSize} onChange={(e) => updateTextStyle("groupSize", e.target.value)} />

                <label>per90字号</label>
                <input type="number" max="48" value={textStyle.per90Size} onChange={(e) => updateTextStyle("per90Size", e.target.value)} />

                <label>刻度字号</label>
                <input type="number" max="48" value={textStyle.tickSize} onChange={(e) => updateTextStyle("tickSize", e.target.value)} />

                <label>图例字号</label>
                <input type="number" max="48" value={textStyle.legendSize} onChange={(e) => updateTextStyle("legendSize", e.target.value)} />

                <label>外圈线宽</label>
                <input type="number" max="8" step="0.1" value={chartStyle.ringStrokeWidth} onChange={(e) => updateChartStyle("ringStrokeWidth", e.target.value)} />

                <label>中心圆线宽</label>
                <input type="number" max="8" step="0.1" value={chartStyle.innerRingStrokeWidth} onChange={(e) => updateChartStyle("innerRingStrokeWidth", e.target.value)} />

                <label>圆线样式</label>
                <select value={chartStyle.ringLineStyle} onChange={(e) => updateChartStyle("ringLineStyle", e.target.value)}>
                  <option value="dashed">虚线</option>
                  <option value="solid">实线</option>
                </select>

                <label>虚线间隔</label>
                <input value={chartStyle.ringDasharray} onChange={(e) => updateChartStyle("ringDasharray", e.target.value)} placeholder="4 8" />

                <label>分组标题半径</label>
                <input type="number" value={chartStyle.groupLabelRadius} onChange={(e) => updateChartStyle("groupLabelRadius", e.target.value)} />

                <label>分组标题X偏移</label>
                <input type="number" value={chartStyle.groupLabelOffsetX} onChange={(e) => updateChartStyle("groupLabelOffsetX", e.target.value)} />

                <label>分组标题Y偏移</label>
                <input type="number" value={chartStyle.groupLabelOffsetY} onChange={(e) => updateChartStyle("groupLabelOffsetY", e.target.value)} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="image-section">
          <button type="button" className="section-toggle" onClick={() => setImagePanelOpen((prev) => !prev)}>
            <span>图片设置</span>
            <span>{imagePanelOpen ? "▾" : "▸"}</span>
          </button>
          {imagePanelOpen ? (
            <div className="section-body">
              <p className="meta-title">中心图片</p>
              <div className="image-grid">
                <button onClick={onCenterImageClick}>选择电脑图片</button>
                <button onClick={clearCenterImage} disabled={!centerImage.src}>清除图片</button>
                <input
                  ref={centerImageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden-file"
                  onChange={onCenterImageChange}
                />

                <label>图片大小</label>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.01"
                  value={centerImage.scale}
                  onChange={(e) => updateCenterImageScale(e.target.value)}
                  disabled={!centerImage.src}
                />
                <input
                  type="number"
                  min="0.5"
                  max="2.5"
                  step="0.01"
                  value={centerImage.scale}
                  onChange={(e) => updateCenterImageScale(e.target.value)}
                  disabled={!centerImage.src}
                />
              </div>

              <p className="meta-title">左上角图片</p>
              <div className="image-grid">
                <button onClick={onCornerImageClick}>选择电脑图片</button>
                <button onClick={clearCornerImage} disabled={!cornerImage.src}>清除图片</button>
                <input
                  ref={cornerImageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden-file"
                  onChange={onCornerImageChange}
                />

                <label>图片大小(px)</label>
                <input
                  type="number"
                  step="1"
                  value={cornerImage.size}
                  onChange={(e) => updateCornerImage("size", e.target.value)}
                />

                <label>X 位置</label>
                <input
                  type="number"
                  step="1"
                  value={cornerImage.x}
                  onChange={(e) => updateCornerImage("x", e.target.value)}
                />

                <label>Y 位置</label>
                <input
                  type="number"
                  step="1"
                  value={cornerImage.y}
                  onChange={(e) => updateCornerImage("y", e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="btn-row">
          <button onClick={addRow}>新增行</button>
          <button onClick={downloadCsv}>下载 CSV</button>
          <button onClick={onUploadClick}>上传 CSV</button>
          <button onClick={exportSvg}>导出 SVG</button>
          <button onClick={exportPng}>导出 PNG</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden-file"
            onChange={onCsvFileChange}
          />
        </div>

        {message ? <p className="msg ok">{message}</p> : null}
        {error ? <p className="msg err">{error}</p> : null}

        <div className="title-row">
          <label>粘贴 CSV 文本后导入（可选）</label>
          <textarea
            className="csv-input"
            placeholder={"支持表头: metric,value,group,order,subOrder 或 指标,百分比,分组,顺序,组内顺序"}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <button onClick={importCsvFromTextarea}>从文本导入 CSV</button>
        </div>

        <div className="table-tools">
          <button onClick={addRow}>在表格中添加一行</button>
          <div className="row-reorder-control">
            <label>重排模式</label>
            <select value={rowReorderMode} onChange={(e) => setRowReorderMode(e.target.value)}>
              <option value={REORDER_MODE_ORDER}>同步 order（图表跟随）</option>
              <option value={REORDER_MODE_VIEW}>仅表格顺序</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table className="radar-data-table">
            <colgroup>
              <col className="col-metric" />
              <col className="col-group" />
              <col className="col-value" />
              <col className="col-per90" />
              <col className="col-tier" />
              <col className="col-order" />
              <col className="col-suborder" />
              <col className="col-up" />
              <col className="col-down" />
              <col className="col-delete" />
            </colgroup>
            <thead>
              <tr>
                <th>metric*</th>
                <th>group*</th>
                <th>value*</th>
                <th>per90</th>
                <th>tier(自动)</th>
                <th>order*</th>
                <th>组内顺序</th>
                <th>上移</th>
                <th>下移</th>
                <th>删除</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td>
                    <input value={row.metric} onChange={(e) => updateCell(index, "metric", e.target.value)} />
                  </td>
                  <td>
                    <input value={row.group} onChange={(e) => updateCell(index, "group", e.target.value)} />
                  </td>
                  <td>
                    <input
                      type="number"
                      max="100"
                      step="0.01"
                      value={row.value}
                      onChange={(e) => updateCell(index, "value", e.target.value)}
                    />
                  </td>
                  <td>
                    <input value={row.per90} onChange={(e) => updateCell(index, "per90", e.target.value)} />
                  </td>
                  <td>
                    <input value={`${TIER_LABELS[row.tier] || "中等"} (${row.tier || "avg"})`} readOnly />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="1"
                      value={row.order}
                      onChange={(e) => updateCell(index, "order", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="1"
                      value={row.subOrder}
                      onChange={(e) => updateCell(index, "subOrder", e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="move-btn"
                      onClick={() => moveRow(index, -1)}
                      disabled={index === 0}
                    >
                      上移
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="move-btn"
                      onClick={() => moveRow(index, 1)}
                      disabled={index === rows.length - 1}
                    >
                      下移
                    </button>
                  </td>
                  <td>
                    <button className="danger" onClick={() => removeRow(index)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="right-panel">
        <div className="right-sticky">
          <svg id="radar-svg" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}>
          <defs>
            <clipPath id="center-image-clip">
              <circle cx={CENTER_X} cy={CENTER_Y} r={INNER_RING - 2} />
            </clipPath>
          </defs>
          <rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#f8f5ef" />

          {cornerImage.src ? (
            <image
              href={cornerImage.src}
              x={cornerImage.x}
              y={cornerImage.y}
              width={cornerImage.size}
              height={cornerImage.size}
              preserveAspectRatio="xMidYMid meet"
            />
          ) : null}

          {[20, 40, 60, 80, 100].map((pct) => {
            const radius = INNER_RING + (pct / 100) * MAX_RADIAL_LENGTH;
            return (
              <g key={pct}>
                <circle
                  cx={CENTER_X}
                  cy={CENTER_Y}
                  r={radius}
                  fill="none"
                  stroke="#d0cdc6"
                  strokeWidth={chartStyle.ringStrokeWidth}
                  strokeDasharray={chartStyle.ringLineStyle === "dashed" ? chartStyle.ringDasharray : "none"}
                />
                <text x={CENTER_X + 8} y={CENTER_Y - radius + 16} fill="#9a9389" fontSize={textStyle.tickSize} fontFamily={textStyle.fontFamily}>
                  {pct}
                </text>
              </g>
            );
          })}

          <circle cx={CENTER_X} cy={CENTER_Y} r={INNER_RING} fill="#f8f5ef" stroke="none" />

          {centerImage.src ? (
            <image
              href={centerImage.src}
              x={CENTER_X - (INNER_RING * 2 * centerImage.scale) / 2}
              y={CENTER_Y - (INNER_RING * 2 * centerImage.scale) / 2}
              width={INNER_RING * 2 * centerImage.scale}
              height={INNER_RING * 2 * centerImage.scale}
              preserveAspectRatio="xMidYMid meet"
              clipPath="url(#center-image-clip)"
            />
          ) : null}

          <circle cx={CENTER_X} cy={CENTER_Y} r={INNER_RING} fill="none" stroke="#a89f94" strokeWidth={chartStyle.innerRingStrokeWidth} />

          {sortedRows.map((row, i) => {
            const angle = stats.startAngle + i * stats.step;
            const a0 = angle - stats.barWidth / 2;
            const a1 = angle + stats.barWidth / 2;
            const barInnerRadius = INNER_RING + BAR_INNER_GAP;
            const barSpan = MAX_RADIAL_LENGTH - BAR_INNER_GAP;
            const endRadius = barInnerRadius + (Number(row.value) / 100) * barSpan;
            const color = row.color?.trim() || DEFAULT_TIER_COLORS[row.tier] || DEFAULT_TIER_COLORS.avg;
            const barPath = annularSectorPath(a0, a1, barInnerRadius, endRadius);

            const labelRadius = METRIC_LABEL_RADIUS;
            const tx = CENTER_X + labelRadius * Math.cos(angle);
            const ty = CENTER_Y + labelRadius * Math.sin(angle);
            const per90Inner = INNER_RING + 10;
            const per90Outer = INNER_RING + 36;
            const per90A0 = angle - stats.barWidth * 0.28;
            const per90A1 = angle + stats.barWidth * 0.28;
            const per90Path = annularSectorPath(per90A0, per90A1, per90Inner, per90Outer);
            const per90Center = polarPoint((per90Inner + per90Outer) / 2, angle);

            return (
              <g key={`${row.metric}-${i}`}>
                <path d={barPath} fill={colorToAlpha(color)} stroke={color} strokeWidth="2" />
                <text
                  x={tx}
                  y={ty}
                  fill={color}
                  fontSize={textStyle.metricSize}
                  fontFamily={textStyle.fontFamily}
                  textAnchor="middle"
                >
                  {row.metric}
                </text>

                {row.per90 ? (
                  <g>
                    <path d={per90Path} fill={color} stroke="none" />
                    <text
                      x={per90Center.x}
                      y={per90Center.y + 4}
                      fill="#fff"
                      fontSize={textStyle.per90Size}
                      fontFamily={textStyle.fontFamily}
                      textAnchor="middle"
                    >
                      {row.per90}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {stats.groupStarts.map((groupStart, idx) => {
            const next = stats.groupStarts[idx + 1]?.index ?? sortedRows.length;
            const boundaryAngle = stats.startAngle + groupStart.index * stats.step - stats.step / 2;
            const x1 = CENTER_X + (INNER_RING - 16) * Math.cos(boundaryAngle);
            const y1 = CENTER_Y + (INNER_RING - 16) * Math.sin(boundaryAngle);
            const x2 = CENTER_X + (INNER_RING + MAX_RADIAL_LENGTH + 20) * Math.cos(boundaryAngle);
            const y2 = CENTER_Y + (INNER_RING + MAX_RADIAL_LENGTH + 20) * Math.sin(boundaryAngle);

            const midIndex = (groupStart.index + next - 1) / 2;
            const midAngle = stats.startAngle + midIndex * stats.step;
            const gx = CENTER_X + chartStyle.groupLabelRadius * Math.cos(midAngle) + chartStyle.groupLabelOffsetX;
            const gy = CENTER_Y + chartStyle.groupLabelRadius * Math.sin(midAngle) + chartStyle.groupLabelOffsetY;

            return (
              <g key={`${groupStart.group}-${idx}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c1bbb2" strokeWidth="1.2" />
                <text x={gx} y={gy} fill="#6f675d" fontSize={textStyle.groupSize} fontFamily={textStyle.fontFamily} fontWeight="700" textAnchor="middle">
                  {groupStart.group}
                </text>
              </g>
            );
          })}

          <text x={CENTER_X} y="58" textAnchor="middle" fontSize={textStyle.titleSize} fontFamily={textStyle.fontFamily} fontWeight="700" fill="#2f2a24">
            {title}
          </text>
          <text x={CENTER_X} y="98" textAnchor="middle" fontSize={textStyle.subtitleSize} fontFamily={textStyle.fontFamily} fill="#5f5850">
            {subtitle}
          </text>

          <text x="980" y="1125" fill={DEFAULT_TIER_COLORS.elite} fontSize={textStyle.legendSize} fontFamily={textStyle.fontFamily}>
            顶级（前10%）
          </text>
          <text x="980" y="1150" fill={DEFAULT_TIER_COLORS.above_avg} fontSize={textStyle.legendSize} fontFamily={textStyle.fontFamily}>
            高于平均（11%-35%）
          </text>
          <text x="980" y="1175" fill={DEFAULT_TIER_COLORS.avg} fontSize={textStyle.legendSize} fontFamily={textStyle.fontFamily}>
            平均（36%-66%）
          </text>
          <text x="980" y="1200" fill={DEFAULT_TIER_COLORS.bottom} fontSize={textStyle.legendSize} fontFamily={textStyle.fontFamily}>
            低于平均（后35%）
          </text>
          </svg>
        </div>
      </div>

    </div>
  );

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand">雷达图生成器V3.1</div>
        <nav className="nav-list" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`nav-item${activePage === item.key ? " active" : ""}`}
              onClick={() => setActivePage(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content-shell">
        {activePage === "home" ? <HomePage onEnterRadar={() => setActivePage("radar")} /> : null}
        {activePage === "radar" ? radarPage : null}
        {activePage === "about" ? <AboutPage /> : null}
        {activePage === "project_mapping" ? <ProjectMappingPage /> : null}
        {activePage === "player_data" ? (
          <PlayerDataPage
            playerDataMeta={playerDataMeta}
            formatDateTime={formatDateTime}
            selectedDatasetId={selectedDatasetId}
            setSelectedDatasetId={setSelectedDatasetId}
            datasetOptions={datasetOptions}
            onPlayerExcelUploadClick={onPlayerExcelUploadClick}
            playerDataImporting={playerDataImporting}
            handleDeleteCurrentDataset={handleDeleteCurrentDataset}
            playerExcelInputRef={playerExcelInputRef}
            onPlayerExcelChange={onPlayerExcelChange}
            playerSearchQuery={playerSearchQuery}
            setPlayerSearchQuery={setPlayerSearchQuery}
            playerOptions={playerOptions}
            selectedPlayerId={selectedPlayerId}
            setSelectedPlayerId={setSelectedPlayerId}
            filteredPlayerOptions={filteredPlayerOptions}
            playerDataMessage={playerDataMessage}
            playerDataError={playerDataError}
            selectedPlayerName={selectedPlayerName}
            selectedMetricColumns={selectedMetricColumns}
            handleSelectAllMetricColumns={handleSelectAllMetricColumns}
            handleClearMetricColumns={handleClearMetricColumns}
            handleImportSelectedMetricsToRadar={handleImportSelectedMetricsToRadar}
            playerDataLoading={playerDataLoading}
            playerDataMetaNumericColumns={playerDataMeta.numericColumns || []}
            selectedPlayerDetail={selectedPlayerDetail}
            handleToggleMetricColumn={handleToggleMetricColumn}
            formatPlayerDataColumnLabel={formatPlayerDataColumnLabel}
          />
        ) : null}
      </main>
    </div>
  );
}

export default App;
