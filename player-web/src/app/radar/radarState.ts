import {
  ALL_COLUMNS,
  BAR_INNER_GAP,
  CENTER_X,
  CENTER_Y,
  DEFAULT_CENTER_IMAGE,
  DEFAULT_CHART_STYLE,
  DEFAULT_CORNER_IMAGE,
  DEFAULT_META,
  DEFAULT_TEXT_STYLE,
  HEADER_ALIASES,
  INITIAL_ROWS,
  INNER_RING,
  MAX_RADIAL_LENGTH,
  METRIC_GROUP_RULES,
  REQUIRED_COLUMNS,
  REORDER_MODE_ORDER,
  TIER_ALIASES
} from "../constants";
import { getNameMappingRowsByEnglish, normalizePlayerName } from "../../utils/nameMappingStore";
import { getProjectZhByColumn } from "../../utils/projectMappingStore";
import { readScopedStore, writeScopedStore } from "../../utils/storageScope";

export function polarPoint(radius, angle) {
  return {
    x: CENTER_X + radius * Math.cos(angle),
    y: CENTER_Y + radius * Math.sin(angle)
  };
}

export function annularSectorPath(a0, a1, rInner, rOuter) {
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

export function formatRadarTitlePlayerName(enName, manualZh = "") {
  const en = String(enName || "").trim();
  if (!en) return "";
  const manual = String(manualZh || "").trim();
  if (manual) return `${en} ${manual}`;
  const zh = String(getNameMappingRowsByEnglish().get(normalizePlayerName(en).toLowerCase())?.zh || "").trim();
  return zh ? `${en} ${zh}` : en;
}

export function colorToAlpha(hex, alpha = 0.22) {
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

export function parseCsv(text) {
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

export function toCsv(rows) {
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

export function computeTierFromValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "avg";
  if (num >= 90) return "elite";
  if (num >= 65) return "above_avg";
  if (num >= 34) return "avg";
  return "bottom";
}

export function recomputeRowsTier(rows) {
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

export function resequenceSubOrder(rows) {
  const counter = new Map();
  return rows.map((row) => {
    const key = `${Math.floor(Number(row.order) || 0)}::${String(row.group || "")}`;
    const next = Number(counter.get(key) || 0) + 1;
    counter.set(key, next);
    return { ...row, subOrder: next };
  });
}

export function readStorage(key, fallbackValue) {
  return readScopedStore(key, fallbackValue);
}

export function writeStorageWithResult(key, value) {
  return writeScopedStore(key, value);
}

export function writeStorage(key, value) {
  return writeStorageWithResult(key, value).ok;
}

function normalizePlayerMetricPreset(item) {
  if (!item || typeof item !== "object") return null;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!id || !name) return null;
  const seen = new Set();
  const columns = (Array.isArray(item.columns) ? item.columns : [])
    .map((column) => String(column || "").trim())
    .filter((column) => {
      if (!column || seen.has(column)) return false;
      seen.add(column);
      return true;
    });
  return {
    id,
    name,
    columns,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : ""
  };
}

export function normalizePlayerMetricPresets(input) {
  if (Array.isArray(input)) {
    return input
      .map(normalizePlayerMetricPreset)
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  if (!input || typeof input !== "object") return [];

  const usedIds = new Set<string>();
  const merged = [];
  Object.values(input).forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) => {
      const normalized = normalizePlayerMetricPreset(item);
      if (!normalized) return;
      let nextId = normalized.id;
      if (usedIds.has(nextId)) {
        nextId = `${normalized.id}_${Math.random().toString(36).slice(2, 7)}`;
      }
      usedIds.add(nextId);
      merged.push(nextId === normalized.id ? normalized : { ...normalized, id: nextId });
    });
  });

  return merged.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export function normalizeMatchMetricPresets(input) {
  return normalizePlayerMetricPresets(input);
}

export function normalizeSelectionMap(input) {
  if (!input || typeof input !== "object") return {};
  return Object.entries(input).reduce((acc: Record<string, string>, [datasetId, value]) => {
    const key = String(datasetId || "").trim();
    const presetId = String(value || "").trim();
    if (key && presetId) {
      acc[key] = presetId;
    }
    return acc;
  }, {});
}

export function normalizeExportSequenceMap(input) {
  if (!input || typeof input !== "object") return {};
  return Object.entries(input).reduce((acc: Record<string, number>, [key, value]) => {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = Number(value);
    if (normalizedKey && Number.isFinite(normalizedValue) && normalizedValue >= 0) {
      acc[normalizedKey] = Math.floor(normalizedValue);
    }
    return acc;
  }, {});
}

export function sanitizeExportFilenamePart(text) {
  const normalized = String(text || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");
  return normalized || "当前草稿";
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

export function normalizeSnapshot(snapshot) {
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
    rowReorderMode: REORDER_MODE_ORDER,
    meta: { ...DEFAULT_META, ...(snapshot.meta || {}) },
    textStyle: { ...DEFAULT_TEXT_STYLE, ...(snapshot.textStyle || {}) },
    chartStyle: { ...DEFAULT_CHART_STYLE, ...(snapshot.chartStyle || {}) },
    centerImage,
    cornerImage
  };
}

export function normalizePersistedState(input) {
  if (!input || typeof input !== "object") {
    return {
      draft: normalizeSnapshot(null),
      presets: [],
      selectedPresetId: "draft",
      playerMetricPresets: [],
      matchMetricPresets: [],
      selectedMatchMetricPresetByDataset: {}
    };
  }

  const draft = normalizeSnapshot(input.draft);
  const presets = normalizePresets(input.presets);
  const selected = typeof input.selectedPresetId === "string" ? input.selectedPresetId : "draft";
  const selectedPresetId = selected === "draft" || presets.some((item) => item.id === selected) ? selected : "draft";
  const playerMetricPresets = normalizePlayerMetricPresets(input.playerMetricPresets ?? input.playerMetricPresetsByDataset);
  const matchMetricPresets = normalizeMatchMetricPresets(input.matchMetricPresets);
  const selectedMatchMetricPresetByDataset = normalizeSelectionMap(input.selectedMatchMetricPresetByDataset);

  return { draft, presets, selectedPresetId, playerMetricPresets, matchMetricPresets, selectedMatchMetricPresetByDataset };
}

export function formatPlayerDataColumnLabel(column) {
  const en = String(column || "").trim();
  const zh = getProjectZhByColumn(en);
  if (zh && en && zh !== en) return `${zh} (${en})`;
  return en || column;
}

function stripPer90Text(text) {
  return String(text || "")
    .replace(/每90分钟/g, "")
    .replace(/\s*per\s*90/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function getMetricDisplayNameFromColumn(column) {
  const mapped = getProjectZhByColumn(column);
  if (mapped) {
    return stripPer90Text(mapped);
  }
  return stripPer90Text(column);
}

export function inferMetricGroupAndOrder(column, metricText = "") {
  const text = `${String(column || "")} ${String(metricText || "")}`.toLowerCase().trim();
  for (const rule of METRIC_GROUP_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return { group: rule.group, order: rule.order };
    }
  }
  return { group: "其他", order: 4 };
}

function normalizeColumnKey(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveImportedMinutes(columns) {
  if (!Array.isArray(columns) || columns.length === 0) return "";
  const exact = columns.find((item) => normalizeColumnKey(item?.column) === "minutes played");
  const matched = exact || columns.find((item) => {
    const key = normalizeColumnKey(item?.column);
    return ["minute", "minutes", "mins", "playing time", "time played", "出场时间", "出场分钟", "分钟"].some((kw) => key.includes(kw));
  });
  return String(matched?.value ?? "").trim();
}

export function resolveImportedAge(columns) {
  if (!Array.isArray(columns) || columns.length === 0) return "";
  const exact = columns.find((item) => normalizeColumnKey(item?.column) === "age");
  const matched = exact || columns.find((item) => {
    const key = normalizeColumnKey(item?.column);
    return ["age", "年龄"].some((kw) => key.includes(kw));
  });
  return String(matched?.value ?? "").trim();
}

export function resolveImportedPosition(columns) {
  if (!Array.isArray(columns) || columns.length === 0) return "";
  const exact = columns.find((item) => normalizeColumnKey(item?.column) === "position");
  const matched = exact || columns.find((item) => {
    const key = normalizeColumnKey(item?.column);
    return ["position", "pos", "位置"].some((kw) => key.includes(kw));
  });
  return String(matched?.value ?? "").trim();
}
