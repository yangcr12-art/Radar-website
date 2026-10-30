import { readSessionStore, writeSessionStore } from "../../utils/sessionStore";

const SCOUT_SESSION_KEY = "player_web_scout_settings_session_v1";
const DEFAULT_SETTINGS = {
  selectedDatasetId: "",
  selectedRoleId: "target_forward",
  playerSearch: "",
  earlySeason: false,
  minMinutes: 300,
  minAvgMinutes: 15,
  reliabilityMinutes: 500
};

export function readScoutSettings() {
  const stored = readSessionStore<Partial<typeof DEFAULT_SETTINGS> | null>(SCOUT_SESSION_KEY, null);
  const settings = { ...DEFAULT_SETTINGS };
  if (!stored || typeof stored !== "object") return settings;
  for (const key of ["selectedDatasetId", "selectedRoleId", "playerSearch"] as const) {
    if (typeof stored[key] === "string") settings[key] = stored[key];
  }
  if (typeof stored.earlySeason === "boolean") settings.earlySeason = stored.earlySeason;
  for (const key of ["minMinutes", "minAvgMinutes", "reliabilityMinutes"] as const) {
    const value = stored[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) settings[key] = value;
  }
  return settings;
}

export function saveScoutSettings(settings: typeof DEFAULT_SETTINGS) {
  writeSessionStore(SCOUT_SESSION_KEY, settings);
}
