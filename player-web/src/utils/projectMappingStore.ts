import { PROJECT_MAPPING_COLUMNS } from "../data/projectMappingColumns";
import {
  defaultPercentileAlgorithm,
  normalizePercentileAlgorithm
} from "../data/projectPercentileAlgorithms";
import { emitMappingStoreChanged } from "./mappingSync";
import { buildScopedStorageKey, writeScopedStore } from "./storageScope";

const PROJECT_GROUP_STORAGE_KEY = "player_web_project_mapping_groups_v1";
const PROJECT_PERCENTILE_ALGORITHM_STORAGE_KEY = "player_web_project_mapping_percentile_algorithms_v1";
const PROJECT_CUSTOM_ROWS_STORAGE_KEY = "player_web_project_mapping_custom_rows_v1";
const PROJECT_HIDDEN_BUILTIN_STORAGE_KEY = "player_web_project_mapping_hidden_builtin_keys_v1";

const PROJECT_GROUP_ORDER = {
  传球: 1,
  passing: 1,
  对抗: 2,
  duel: 2,
  duels: 2,
  防守: 3,
  defending: 3,
  defense: 3,
  体能: 4,
  fitness: 4,
  其他: 5
};

const BUILTIN_ROW_BY_KEY = new Map(
  PROJECT_MAPPING_COLUMNS.map((item) => [normalizeColumnKey(item.en), {
    en: String(item.en || "").trim(),
    zh: String(item.zh || "").trim(),
    percentileAlgorithm: normalizePercentileAlgorithm(item.percentileAlgorithm, defaultPercentileAlgorithm(item.en))
  }])
);

const PROJECT_ZH_MAP = new Map(
  PROJECT_MAPPING_COLUMNS.map((item) => [String(item.en || "").trim(), String(item.zh || "").trim()])
);

function normalizeColumnKey(text) {
  return String(text || "").trim().toLowerCase();
}

function normalizeGroupMap(input) {
  if (!input || typeof input !== "object") return {};
  const next = {};
  Object.entries(input).forEach(([key, value]) => {
    const normalizedKey = normalizeColumnKey(key);
    if (!normalizedKey) return;
    next[normalizedKey] = String(value || "").trim();
  });
  return next;
}

function normalizePercentileAlgorithmMap(input) {
  if (!input || typeof input !== "object") return {};
  const next = {};
  Object.entries(input).forEach(([key, value]) => {
    const normalizedKey = normalizeColumnKey(key);
    if (!normalizedKey) return;
    next[normalizedKey] = normalizePercentileAlgorithm(value, defaultPercentileAlgorithm(key));
  });
  return next;
}

function normalizeCustomRows(input) {
  if (!Array.isArray(input)) return [];
  const rows = [];
  const seen = new Set();
  input.forEach((row) => {
    const en = String(row?.en || "").trim();
    const key = normalizeColumnKey(en);
    if (!en || !key || seen.has(key) || BUILTIN_ROW_BY_KEY.has(key)) return;
    seen.add(key);
    rows.push({
      en,
      zh: String(row?.zh || "").trim(),
      group: String(row?.group || "").trim(),
      percentileAlgorithm: normalizePercentileAlgorithm(row?.percentileAlgorithm, defaultPercentileAlgorithm(en)),
      isBuiltin: false
    });
  });
  return rows;
}

function normalizeHiddenBuiltinKeys(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const keys = [];
  input.forEach((item) => {
    const key = normalizeColumnKey(item);
    if (!key || seen.has(key) || !BUILTIN_ROW_BY_KEY.has(key)) return;
    seen.add(key);
    keys.push(key);
  });
  return keys;
}

function readGroupOverrides() {
  try {
    const raw = localStorage.getItem(buildScopedStorageKey(PROJECT_GROUP_STORAGE_KEY));
    if (!raw) return {};
    return normalizeGroupMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function readCustomRows() {
  try {
    const raw = localStorage.getItem(buildScopedStorageKey(PROJECT_CUSTOM_ROWS_STORAGE_KEY));
    if (!raw) return [];
    return normalizeCustomRows(JSON.parse(raw));
  } catch {
    return [];
  }
}

function readPercentileAlgorithmOverrides() {
  try {
    const raw = localStorage.getItem(buildScopedStorageKey(PROJECT_PERCENTILE_ALGORITHM_STORAGE_KEY));
    if (!raw) return {};
    return normalizePercentileAlgorithmMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function readHiddenBuiltinKeys() {
  try {
    const raw = localStorage.getItem(buildScopedStorageKey(PROJECT_HIDDEN_BUILTIN_STORAGE_KEY));
    if (!raw) return [];
    return normalizeHiddenBuiltinKeys(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveGroupOverrides(nextMap) {
  const normalized = normalizeGroupMap(nextMap);
  return writeScopedStore(PROJECT_GROUP_STORAGE_KEY, normalized);
}

function savePercentileAlgorithmOverrides(nextMap) {
  const normalized = normalizePercentileAlgorithmMap(nextMap);
  return writeScopedStore(PROJECT_PERCENTILE_ALGORITHM_STORAGE_KEY, normalized);
}

function saveCustomRows(rows) {
  const normalized = normalizeCustomRows(rows);
  return writeScopedStore(PROJECT_CUSTOM_ROWS_STORAGE_KEY, normalized);
}

function saveHiddenBuiltinKeys(keys) {
  const normalized = normalizeHiddenBuiltinKeys(keys);
  return writeScopedStore(PROJECT_HIDDEN_BUILTIN_STORAGE_KEY, normalized);
}

function buildRows() {
  const overrides = readGroupOverrides();
  const algorithmOverrides = readPercentileAlgorithmOverrides();
  const hidden = new Set(readHiddenBuiltinKeys());
  const builtinRows = PROJECT_MAPPING_COLUMNS
    .map((item) => {
      const en = String(item.en || "").trim();
      const key = normalizeColumnKey(en);
      if (!en || hidden.has(key)) return null;
      return {
        en,
        zh: String(item.zh || "").trim(),
        group: String(overrides[key] || "").trim(),
        percentileAlgorithm: normalizePercentileAlgorithm(
          algorithmOverrides[key],
          normalizePercentileAlgorithm(item.percentileAlgorithm, defaultPercentileAlgorithm(en))
        ),
        isBuiltin: true
      };
    })
    .filter(Boolean);

  const customRows = readCustomRows().map((row) => {
    const key = normalizeColumnKey(row.en);
    return {
      en: row.en,
      zh: row.zh,
      group: String(overrides[key] || row.group || "").trim(),
      percentileAlgorithm: normalizePercentileAlgorithm(
        algorithmOverrides[key] || row.percentileAlgorithm,
        defaultPercentileAlgorithm(row.en)
      ),
      isBuiltin: false
    };
  });

  return [...builtinRows, ...customRows];
}

function toGroupMap(rows) {
  const next = {};
  if (!Array.isArray(rows)) return next;
  rows.forEach((row) => {
    const key = normalizeColumnKey(row?.en);
    if (!key) return;
    next[key] = String(row?.group || "").trim();
  });
  return next;
}

function toPercentileAlgorithmMap(rows) {
  const next = {};
  if (!Array.isArray(rows)) return next;
  rows.forEach((row) => {
    const key = normalizeColumnKey(row?.en);
    if (!key) return;
    next[key] = normalizePercentileAlgorithm(row?.percentileAlgorithm, defaultPercentileAlgorithm(row?.en));
  });
  return next;
}

export function hasProjectMappingColumn(column) {
  const key = normalizeColumnKey(column);
  if (!key) return false;
  if (BUILTIN_ROW_BY_KEY.has(key)) return true;
  return readCustomRows().some((row) => normalizeColumnKey(row.en) === key);
}

export function getProjectMappingRows() {
  return buildRows();
}

export function saveProjectMappingRows(rows) {
  if (!Array.isArray(rows)) return { ok: false, error: "Invalid rows payload", name: "ValidationError" };

  const visibleBuiltinKeys = new Set();
  const customRows = [];
  rows.forEach((row) => {
    const en = String(row?.en || "").trim();
    const key = normalizeColumnKey(en);
    if (!en || !key) return;
    if (BUILTIN_ROW_BY_KEY.has(key)) {
      visibleBuiltinKeys.add(key);
      return;
    }
    customRows.push({
      en,
      zh: String(row?.zh || "").trim(),
      group: String(row?.group || "").trim(),
      percentileAlgorithm: normalizePercentileAlgorithm(row?.percentileAlgorithm, defaultPercentileAlgorithm(en)),
      isBuiltin: false
    });
  });

  const hiddenBuiltinKeys = [];
  BUILTIN_ROW_BY_KEY.forEach((_, key) => {
    if (!visibleBuiltinKeys.has(key)) hiddenBuiltinKeys.push(key);
  });

  const groupMap = toGroupMap(rows);
  const percentileAlgorithmMap = toPercentileAlgorithmMap(rows);
  const ok1 = saveGroupOverrides(groupMap);
  const ok2 = savePercentileAlgorithmOverrides(percentileAlgorithmMap);
  const ok3 = saveCustomRows(customRows);
  const ok4 = saveHiddenBuiltinKeys(hiddenBuiltinKeys);
  if (ok1.ok && ok2.ok && ok3.ok && ok4.ok) {
    emitMappingStoreChanged("project");
  }
  if (ok1.ok && ok2.ok && ok3.ok && ok4.ok) return ok1;
  return !ok1.ok ? ok1 : !ok2.ok ? ok2 : !ok3.ok ? ok3 : ok4;
}

export function saveProjectGroupByColumn(nextMap) {
  const result = saveGroupOverrides(nextMap);
  if (result.ok) {
    emitMappingStoreChanged("project");
  }
  return result;
}

export function getProjectZhByColumn(column) {
  const en = String(column || "").trim();
  const builtinZh = PROJECT_ZH_MAP.get(en);
  if (builtinZh) return builtinZh;

  const key = normalizeColumnKey(en);
  const custom = readCustomRows().find((row) => normalizeColumnKey(row.en) === key);
  return String(custom?.zh || "").trim();
}

export function getProjectGroupByColumn(column) {
  const en = normalizeColumnKey(column);
  const overrides = readGroupOverrides();
  return String(overrides[en] || "").trim();
}

export function getProjectPercentileAlgorithmByColumn(column) {
  const key = normalizeColumnKey(column);
  const overrides = readPercentileAlgorithmOverrides();
  return normalizePercentileAlgorithm(overrides[key], defaultPercentileAlgorithm(column));
}

export function getProjectGroupOrder(group) {
  const key = String(group || "").trim();
  const lower = key.toLowerCase();
  return PROJECT_GROUP_ORDER[key] || PROJECT_GROUP_ORDER[lower] || 5;
}
