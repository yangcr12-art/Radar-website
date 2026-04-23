import { emitMappingStoreChanged } from "./mappingSync";

const TEAM_MAPPING_STORAGE_KEY = "player_web_team_mapping_rows_v1";

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

export function normalizeTeamName(text) {
  return String(text || "").trim();
}

export function getTeamMappingRows() {
  try {
    const raw = localStorage.getItem(TEAM_MAPPING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeRows(parsed);
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
  try {
    const normalized = normalizeRows(rows);
    localStorage.setItem(TEAM_MAPPING_STORAGE_KEY, JSON.stringify(normalized));
    emitMappingStoreChanged("team");
    return true;
  } catch {
    return false;
  }
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
