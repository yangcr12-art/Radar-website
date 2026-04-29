import { emitMappingStoreChanged } from "./mappingSync";
import { buildScopedStorageKey } from "./storageScope";

const NAME_MAPPING_STORAGE_KEY = "player_web_name_mapping_rows_v1";

function normalizeRow(item) {
  if (!item || typeof item !== "object") {
    return { en: "", zh: "", team: "" };
  }
  return {
    en: String(item.en || "").trim(),
    zh: String(item.zh || "").trim(),
    team: String(item.team || "").trim()
  };
}

function normalizeRows(input) {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeRow).filter((row) => row.en || row.zh || row.team);
}

export function normalizePlayerName(text) {
  return String(text || "").trim();
}

export function getNameMappingRows() {
  try {
    const raw = localStorage.getItem(buildScopedStorageKey(NAME_MAPPING_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeRows(parsed);
  } catch {
    return [];
  }
}

export function getNameMappingRowsByEnglish() {
  const rows = getNameMappingRows();
  const mapping = new Map();
  rows.forEach((row) => {
    const key = normalizePlayerName(row.en).toLowerCase();
    if (!key) return;
    mapping.set(key, row);
  });
  return mapping;
}

export function getPlayerZhByEnglish(name) {
  const key = normalizePlayerName(name).toLowerCase();
  if (!key) return "";
  const row = getNameMappingRowsByEnglish().get(key);
  return String(row?.zh || "").trim();
}

export function saveNameMappingRows(rows) {
  try {
    const normalized = normalizeRows(rows);
    localStorage.setItem(buildScopedStorageKey(NAME_MAPPING_STORAGE_KEY), JSON.stringify(normalized));
    emitMappingStoreChanged("name");
    return true;
  } catch {
    return false;
  }
}

export function mergeNameMappingRows(existingRows, importedPlayerNames) {
  const baseRows = normalizeRows(existingRows);
  const nextRows = [...baseRows];
  const existingKeys = new Set(baseRows.map((row) => normalizePlayerName(row.en).toLowerCase()).filter(Boolean));
  const imported = Array.isArray(importedPlayerNames) ? importedPlayerNames : [];

  imported.forEach((name) => {
    const en = normalizePlayerName(name);
    const key = en.toLowerCase();
    if (!en || existingKeys.has(key)) return;
    nextRows.push({ en, zh: "", team: "" });
    existingKeys.add(key);
  });

  return nextRows;
}
