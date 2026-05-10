import { emitMappingStoreChanged } from "./mappingSync";
import { buildScopedStorageKey, writeScopedStore } from "./storageScope";

const MATCH_PROJECT_MAPPING_STORAGE_KEY = "player_web_match_project_mapping_rows_v1";

type MatchProjectRow = {
  en: string;
  zh: string;
  group: string;
};

function normalizeKey(text: string) {
  return String(text || "").trim().toLowerCase();
}

function normalizeRows(input: any): MatchProjectRow[] {
  if (!Array.isArray(input)) return [];
  const rows: MatchProjectRow[] = [];
  const seen = new Set<string>();
  input.forEach((row) => {
    const en = String(row?.en || "").trim();
    const key = normalizeKey(en);
    if (!en || !key || seen.has(key)) return;
    seen.add(key);
    rows.push({
      en,
      zh: String(row?.zh || "").trim(),
      group: String(row?.group || "").trim()
    });
  });
  return rows;
}

export function getMatchProjectMappingRows(): MatchProjectRow[] {
  try {
    const raw = localStorage.getItem(buildScopedStorageKey(MATCH_PROJECT_MAPPING_STORAGE_KEY));
    if (!raw) return [];
    return normalizeRows(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveMatchProjectMappingRows(rows: MatchProjectRow[]) {
  const result = writeScopedStore(MATCH_PROJECT_MAPPING_STORAGE_KEY, normalizeRows(rows));
  if (result.ok) {
    emitMappingStoreChanged("match_project");
  }
  return result;
}

export function hasMatchProjectMappingColumn(column: string): boolean {
  const key = normalizeKey(column);
  if (!key) return false;
  return getMatchProjectMappingRows().some((row) => normalizeKey(row.en) === key);
}

export function getMatchProjectZhByColumn(column: string): string {
  const key = normalizeKey(column);
  if (!key) return "";
  const found = getMatchProjectMappingRows().find((row) => normalizeKey(row.en) === key);
  return String(found?.zh || "").trim();
}

export function getMatchProjectGroupByColumn(column: string): string {
  const key = normalizeKey(column);
  if (!key) return "";
  const found = getMatchProjectMappingRows().find((row) => normalizeKey(row.en) === key);
  return String(found?.group || "").trim();
}
