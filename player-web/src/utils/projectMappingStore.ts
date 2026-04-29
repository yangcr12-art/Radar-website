import { PROJECT_MAPPING_COLUMNS } from "../data/projectMappingColumns";
import { emitMappingStoreChanged } from "./mappingSync";
import { buildScopedStorageKey } from "./storageScope";

const PROJECT_GROUP_STORAGE_KEY = "player_web_project_mapping_groups_v1";
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
  PROJECT_MAPPING_COLUMNS.map((item) => [normalizeColumnKey(item.en), { en: String(item.en || "").trim(), zh: String(item.zh || "").trim() }])
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
  try {
    const normalized = normalizeGroupMap(nextMap);
    localStorage.setItem(buildScopedStorageKey(PROJECT_GROUP_STORAGE_KEY), JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

function saveCustomRows(rows) {
  try {
    const normalized = normalizeCustomRows(rows);
    localStorage.setItem(buildScopedStorageKey(PROJECT_CUSTOM_ROWS_STORAGE_KEY), JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

function saveHiddenBuiltinKeys(keys) {
  try {
    const normalized = normalizeHiddenBuiltinKeys(keys);
    localStorage.setItem(buildScopedStorageKey(PROJECT_HIDDEN_BUILTIN_STORAGE_KEY), JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

function buildRows() {
  const overrides = readGroupOverrides();
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
  if (!Array.isArray(rows)) return false;

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
      isBuiltin: false
    });
  });

  const hiddenBuiltinKeys = [];
  BUILTIN_ROW_BY_KEY.forEach((_, key) => {
    if (!visibleBuiltinKeys.has(key)) hiddenBuiltinKeys.push(key);
  });

  const groupMap = toGroupMap(rows);
  const ok1 = saveGroupOverrides(groupMap);
  const ok2 = saveCustomRows(customRows);
  const ok3 = saveHiddenBuiltinKeys(hiddenBuiltinKeys);
  if (ok1 && ok2 && ok3) {
    emitMappingStoreChanged("project");
  }
  return ok1 && ok2 && ok3;
}

export function saveProjectGroupByColumn(nextMap) {
  const ok = saveGroupOverrides(nextMap);
  if (ok) {
    emitMappingStoreChanged("project");
  }
  return ok;
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

export function getProjectGroupOrder(group) {
  const key = String(group || "").trim();
  const lower = key.toLowerCase();
  return PROJECT_GROUP_ORDER[key] || PROJECT_GROUP_ORDER[lower] || 5;
}
