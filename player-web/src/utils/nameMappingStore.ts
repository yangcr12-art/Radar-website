import { emitMappingStoreChanged } from "./mappingSync";
import { buildScopedStorageKey, writeScopedStore } from "./storageScope";

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

function makeCanonicalPlayerId(text) {
  return normalizePlayerName(text)
    .split("")
    .map((ch) => (/[0-9A-Za-z]/.test(ch) ? ch.toLowerCase() : "_"))
    .join("")
    .replace(/^_+|_+$/g, "");
}

function shouldUpgradeMappedName(currentName, importedName) {
  const current = normalizePlayerName(currentName);
  const imported = normalizePlayerName(importedName);
  if (!current || !imported || current === imported) return false;
  if (!current.includes("_") || imported.includes("_")) return false;
  return makeCanonicalPlayerId(current) === makeCanonicalPlayerId(imported);
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
  const normalized = normalizeRows(rows);
  const result = writeScopedStore(NAME_MAPPING_STORAGE_KEY, normalized);
  if (result.ok) {
    emitMappingStoreChanged("name");
  }
  return result;
}

export function mergeNameMappingRows(existingRows, importedPlayerNames) {
  const baseRows = normalizeRows(existingRows);
  const nextRows = [...baseRows];
  const existingKeys = new Set(baseRows.map((row) => normalizePlayerName(row.en).toLowerCase()).filter(Boolean));
  const canonicalIndexMap = new Map();
  baseRows.forEach((row, index) => {
    const canonicalKey = makeCanonicalPlayerId(row.en);
    if (!canonicalKey || canonicalIndexMap.has(canonicalKey)) return;
    canonicalIndexMap.set(canonicalKey, index);
  });
  const imported = Array.isArray(importedPlayerNames) ? importedPlayerNames : [];

  imported.forEach((name) => {
    const en = normalizePlayerName(name);
    const key = en.toLowerCase();
    if (!en || existingKeys.has(key)) return;
    const canonicalKey = makeCanonicalPlayerId(en);
    const matchedIndex = canonicalKey ? canonicalIndexMap.get(canonicalKey) : undefined;
    if (typeof matchedIndex === "number") {
      const currentRow = nextRows[matchedIndex];
      if (shouldUpgradeMappedName(currentRow?.en, en)) {
        nextRows[matchedIndex] = { ...currentRow, en };
        existingKeys.add(key);
        canonicalIndexMap.set(canonicalKey, matchedIndex);
        return;
      }
    }
    nextRows.push({ en, zh: "", team: "" });
    existingKeys.add(key);
    if (canonicalKey && !canonicalIndexMap.has(canonicalKey)) {
      canonicalIndexMap.set(canonicalKey, nextRows.length - 1);
    }
  });

  return nextRows;
}
