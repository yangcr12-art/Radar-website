import { emitMappingStoreChanged } from "./mappingSync";
import { buildScopedStorageKey, writeScopedStore } from "./storageScope";
import { isQuotaExceededResult } from "./localStorageQuota";

const TEAM_MAPPING_STORAGE_KEY = "player_web_team_mapping_rows_v1";

let teamMappingMemoryRows: TeamMappingRow[] | null = null;

export type TeamMappingRow = {
  en: string;
  zh: string;
  color: string;
  shape: string;
  logoDataUrl: string;
  logoFileName: string;
};

function normalizeRow(item) {
  if (!item || typeof item !== "object") {
    return { en: "", zh: "", color: "", shape: "", logoDataUrl: "", logoFileName: "" };
  }
  return {
    en: String(item.en || "").trim(),
    zh: String(item.zh || "").trim(),
    color: String(item.color || "").trim(),
    shape: String(item.shape || "").trim(),
    logoDataUrl: String(item.logoDataUrl || "").trim(),
    logoFileName: String(item.logoFileName || "").trim()
  };
}

function normalizeRows(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map(normalizeRow)
    .filter((row) => row.en || row.zh);
}

function toStoredRows(rows) {
  return normalizeRows(rows).map((row) => ({
    ...row,
    // Logo base64 strings can exceed localStorage quota very quickly.
    // Keep them in memory and on the backend, but store only lightweight metadata locally.
    logoDataUrl: ""
  }));
}

function clearStoredTeamMappings() {
  try {
    localStorage.removeItem(buildScopedStorageKey(TEAM_MAPPING_STORAGE_KEY));
  } catch {
    // Ignore cleanup failures.
  }
  try {
    localStorage.removeItem(TEAM_MAPPING_STORAGE_KEY);
  } catch {
    // Ignore legacy cleanup failures.
  }
}

export function normalizeTeamName(text) {
  return String(text || "").trim();
}

export function getTeamMappingRows() {
  if (teamMappingMemoryRows) {
    return normalizeRows(teamMappingMemoryRows);
  }
  try {
    const raw = localStorage.getItem(buildScopedStorageKey(TEAM_MAPPING_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const normalized = normalizeRows(parsed);
    teamMappingMemoryRows = normalized;
    return normalized;
  } catch {
    return [];
  }
}

export function getTeamMappingRowsByEnglish() {
  const rows = getTeamMappingRows();
  const mapping = new Map<string, TeamMappingRow>();
  rows.forEach((row) => {
    const key = normalizeTeamName(row.en).toLowerCase();
    if (!key) return;
    mapping.set(key, row);
  });
  return mapping;
}

export function getTeamMappingRowsByName() {
  const rows = getTeamMappingRows();
  const mapping = new Map<string, TeamMappingRow>();
  rows.forEach((row) => {
    const enKey = normalizeTeamName(row.en).toLowerCase();
    if (enKey) mapping.set(enKey, row);
    const zhKey = normalizeTeamName(row.zh).toLowerCase();
    if (zhKey) mapping.set(zhKey, row);
  });
  return mapping;
}

export function saveTeamMappingRows(rows) {
  const normalized = normalizeRows(rows);
  teamMappingMemoryRows = normalized;
  const storedRows = toStoredRows(normalized);
  let result = writeScopedStore(TEAM_MAPPING_STORAGE_KEY, storedRows);
  if (!result.ok && isQuotaExceededResult(result)) {
    clearStoredTeamMappings();
    result = writeScopedStore(TEAM_MAPPING_STORAGE_KEY, storedRows);
  }
  emitMappingStoreChanged("team");
  return result;
}

export function mergeTeamMappingRows(existingRows, importedTeamNames) {
  const baseRows = normalizeRows(existingRows);
  const nextRows = [...baseRows];
  const existingKeys = new Set(baseRows.map((row) => normalizeTeamName(row.en).toLowerCase()).filter(Boolean));
  const imported = Array.isArray(importedTeamNames) ? importedTeamNames : [];

  imported.forEach((name) => {
    const en = normalizeTeamName(name);
    const key = en.toLowerCase();
    if (!en || existingKeys.has(key)) return;
    nextRows.push({ en, zh: "", color: "", shape: "", logoDataUrl: "", logoFileName: "" });
    existingKeys.add(key);
  });

  return nextRows;
}
