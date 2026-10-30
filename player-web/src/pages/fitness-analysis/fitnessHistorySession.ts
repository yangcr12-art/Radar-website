import { readSessionStore, writeSessionStore } from "../../utils/sessionStore";

const KEY = "player_web_fitness_history_settings_session_v1";
export type FitnessHistorySettings = {
  selected: string;
  search: string;
  competition: string;
  start: string;
  end: string;
  fields: string[] | null;
};

function validDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

export function readFitnessHistorySettings(): FitnessHistorySettings {
  const defaults: FitnessHistorySettings = { selected: "", search: "", competition: "", start: "", end: "", fields: null };
  const value = readSessionStore<Partial<FitnessHistorySettings> | null>(KEY, null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  for (const key of ["selected", "search", "competition"] as const) {
    if (typeof value[key] === "string") defaults[key] = value[key];
  }
  defaults.start = validDate(value.start);
  defaults.end = validDate(value.end);
  if (defaults.start && defaults.end && defaults.end < defaults.start) defaults.end = "";
  if (Array.isArray(value.fields)) defaults.fields = [...new Set(value.fields.filter((field): field is string => typeof field === "string" && !!field.trim()))];
  return defaults;
}

export function saveFitnessHistorySettings(settings: FitnessHistorySettings) {
  writeSessionStore(KEY, settings);
}
