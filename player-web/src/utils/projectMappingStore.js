import { PROJECT_MAPPING_COLUMNS } from "../data/projectMappingColumns";

const PROJECT_GROUP_STORAGE_KEY = "player_web_project_mapping_groups_v1";
const PROJECT_GROUP_ORDER = {
  传球: 1,
  passing: 1,
  对抗: 2,
  duel: 2,
  duels: 2,
  防守: 3,
  defending: 3,
  defense: 3,
  其他: 4
};

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

function readGroupOverrides() {
  try {
    const raw = localStorage.getItem(PROJECT_GROUP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return normalizeGroupMap(parsed);
  } catch {
    return {};
  }
}

export function getProjectMappingRows() {
  const overrides = readGroupOverrides();
  return PROJECT_MAPPING_COLUMNS.map((item) => {
    const en = String(item.en || "").trim();
    const key = normalizeColumnKey(en);
    return {
      ...item,
      group: String(overrides[key] || "")
    };
  });
}

export function saveProjectGroupByColumn(nextMap) {
  try {
    const normalized = normalizeGroupMap(nextMap);
    localStorage.setItem(PROJECT_GROUP_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function getProjectZhByColumn(column) {
  const en = String(column || "").trim();
  return PROJECT_ZH_MAP.get(en) || "";
}

export function getProjectGroupByColumn(column) {
  const en = normalizeColumnKey(column);
  const overrides = readGroupOverrides();
  return String(overrides[en] || "").trim();
}

export function getProjectGroupOrder(group) {
  const key = String(group || "").trim();
  const lower = key.toLowerCase();
  return PROJECT_GROUP_ORDER[key] || PROJECT_GROUP_ORDER[lower] || 4;
}
