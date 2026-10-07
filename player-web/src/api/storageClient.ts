const DEFAULT_API_BASE = "http://127.0.0.1:8787";
const API_BASE = (import.meta.env.VITE_STORAGE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
const REQ_TIMEOUT_MS = 8000;
const STATSBOMB_REQ_TIMEOUT_MS = 30000;

export class AuthRequiredError extends Error {
  constructor(message = "请先登录。") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    let body = null;
    try {
      body = await resp.json();
    } catch {
      body = null;
    }

    if (resp.status === 401 || body?.authRequired) {
      throw new AuthRequiredError(body?.error || "请先登录。");
    }

    if (!resp.ok || (body && body.ok === false)) {
      const message = body?.error || `request failed: ${resp.status}`;
      throw new Error(message);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function requestForm(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal
    });

    let body = null;
    try {
      body = await resp.json();
    } catch {
      body = null;
    }

    if (resp.status === 401 || body?.authRequired) {
      throw new AuthRequiredError(body?.error || "请先登录。");
    }

    if (!resp.ok || (body && body.ok === false)) {
      const message = body?.error || `request failed: ${resp.status}`;
      throw new Error(message);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function requestBlob(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    if (resp.status === 401) {
      throw new AuthRequiredError("请先登录。");
    }

    if (!resp.ok) {
      let body = null;
      try {
        body = await resp.json();
      } catch {
        body = null;
      }
      const message = body?.error || `request failed: ${resp.status}`;
      throw new Error(message);
    }

    return await resp.blob();
  } finally {
    clearTimeout(timer);
  }
}

async function requestStatsBomb(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATSBOMB_REQ_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    let body = null;
    try {
      body = await resp.json();
    } catch {
      body = null;
    }

    if (resp.status === 401 || body?.authRequired) {
      throw new AuthRequiredError(body?.error || "请先登录。");
    }
    if (!resp.ok || (body && body.ok === false)) {
      throw new Error(body?.error || `request failed: ${resp.status}`);
    }
    return body;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("StatsBomb 请求超过 30 秒，请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function getApiBase() {
  return API_BASE;
}

export function getApiBaseLabel() {
  return API_BASE || "当前网站同源地址";
}

export function fetchState() {
  return request("/api/state", { method: "GET" });
}

export function fetchAuthStatus() {
  return request("/api/auth/status", { method: "GET" });
}

export function loginSharedSession(username, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function logoutSharedSession() {
  return request("/api/auth/logout", { method: "POST" });
}

export function saveState(data) {
  return request("/api/state", {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export function fetchMappings() {
  return request("/api/mappings", { method: "GET" });
}

export function saveMappings(data) {
  return request("/api/mappings", {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export function migrateFromLocal(data) {
  return request("/api/migrate-from-local", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function checkHealth() {
  return request("/api/health", { method: "GET" });
}

export function importPlayerExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return requestForm("/api/player-data/import-excel", {
    method: "POST",
    body: form
  });
}

export function fetchPlayerDataset(datasetId = "") {
  const query = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : "";
  return request(`/api/player-data${query}`, { method: "GET" });
}

export function fetchPlayerDatasets() {
  return request("/api/player-data/datasets", { method: "GET" });
}

export function deletePlayerDataset(datasetId) {
  return request(`/api/player-data/datasets/${encodeURIComponent(datasetId)}`, { method: "DELETE" });
}

export function fetchPlayerList(datasetId = "") {
  const query = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : "";
  return request(`/api/player-data/players${query}`, { method: "GET" });
}

export function fetchPlayerById(playerId, datasetId = "") {
  const query = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : "";
  return request(`/api/player-data/player/${encodeURIComponent(playerId)}${query}`, { method: "GET" });
}

export function fetchScoutingModels() {
  return request("/api/scout-search/models", { method: "GET" });
}

export function evaluateScoutSearch(payload) {
  return request("/api/scout-search/evaluate", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export function importMatchExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return requestForm("/api/match-data/import-excel", {
    method: "POST",
    body: form
  });
}

export function fetchMatchDatasets() {
  return request("/api/match-data/datasets", { method: "GET" });
}

export function deleteMatchDataset(datasetId) {
  return request(`/api/match-data/datasets/${encodeURIComponent(datasetId)}`, { method: "DELETE" });
}

export function fetchMatchTeamList(datasetId = "") {
  const query = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : "";
  return request(`/api/match-data/teams${query}`, { method: "GET" });
}

export function fetchMatchTeamById(teamId, datasetId = "") {
  const query = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : "";
  return request(`/api/match-data/team/${encodeURIComponent(teamId)}${query}`, { method: "GET" });
}

export function importFitnessExcel(file, playerOverviewSide = "home") {
  const form = new FormData();
  form.append("file", file);
  form.append("playerOverviewSide", String(playerOverviewSide || "home"));
  return requestForm("/api/fitness-data/import-excel", {
    method: "POST",
    body: form
  });
}

export function fetchFitnessDatasets() {
  return request("/api/fitness-data/datasets", { method: "GET" });
}

export function fetchFitnessDataset(datasetId = "") {
  const query = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : "";
  return request(`/api/fitness-data${query}`, { method: "GET" });
}

export function deleteFitnessDataset(datasetId) {
  return request(`/api/fitness-data/datasets/${encodeURIComponent(datasetId)}`, { method: "DELETE" });
}

export function importOptaPdf(file, side = "home") {
  const form = new FormData();
  form.append("file", file);
  form.append("side", String(side || "home"));
  return requestForm("/api/opta-data/import-pdf", {
    method: "POST",
    body: form
  });
}

export function fetchOptaDatasets() {
  return request("/api/opta-data/datasets", { method: "GET" });
}

export function fetchOptaDataset(datasetId = "") {
  const query = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : "";
  return request(`/api/opta-data${query}`, { method: "GET" });
}

export function deleteOptaDataset(datasetId) {
  return request(`/api/opta-data/datasets/${encodeURIComponent(datasetId)}`, { method: "DELETE" });
}

export function importCslStandingsExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return requestForm("/api/csl-standings/import-excel", {
    method: "POST",
    body: form
  });
}

export function importProjectMappingExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return requestForm("/api/project-mapping/import-excel", {
    method: "POST",
    body: form
  });
}

export function exportProjectMappingExcel(rows) {
  return requestBlob("/api/project-mapping/export-excel", {
    method: "POST",
    body: JSON.stringify({ rows })
  });
}

export function importMatchProjectMappingExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return requestForm("/api/match-project-mapping/import-excel", {
    method: "POST",
    body: form
  });
}

export function exportMatchProjectMappingExcel(rows) {
  return requestBlob("/api/match-project-mapping/export-excel", {
    method: "POST",
    body: JSON.stringify({ rows })
  });
}

export function importNameMappingExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return requestForm("/api/name-mapping/import-excel", {
    method: "POST",
    body: form
  });
}

export function exportNameMappingExcel(rows) {
  return requestBlob("/api/name-mapping/export-excel", {
    method: "POST",
    body: JSON.stringify({ rows })
  });
}

export function importTeamMappingExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return requestForm("/api/team-mapping/import-excel", {
    method: "POST",
    body: form
  });
}

export function exportTeamMappingExcel(rows) {
  return requestBlob("/api/team-mapping/export-excel", {
    method: "POST",
    body: JSON.stringify({ rows })
  });
}

export function fetchCslStandingsDatasets() {
  return request("/api/csl-standings/datasets", { method: "GET" });
}

export function fetchCslStandingsDataset(datasetId = "", season = "") {
  const query = new URLSearchParams();
  if (datasetId) query.set("datasetId", datasetId);
  if (season) query.set("season", season);
  const suffix = query.toString();
  return request(`/api/csl-standings${suffix ? `?${suffix}` : ""}`, { method: "GET" });
}

export function deleteCslStandingsDataset(datasetId) {
  return request(`/api/csl-standings/datasets/${encodeURIComponent(datasetId)}`, { method: "DELETE" });
}

export function fetchStatsBombStatus() {
  return requestStatsBomb("/api/statsbomb/status", { method: "GET" });
}

export function testStatsBombConnection() {
  return requestStatsBomb("/api/statsbomb/test-connection", { method: "POST" });
}

export function fetchStatsBombCompetitions() {
  return requestStatsBomb("/api/statsbomb/competitions", { method: "GET" });
}

export function fetchStatsBombMatches(competitionId, seasonId) {
  const query = new URLSearchParams({
    competitionId: String(competitionId),
    seasonId: String(seasonId)
  });
  return requestStatsBomb(`/api/statsbomb/matches?${query.toString()}`, { method: "GET" });
}

export function fetchStatsBombLeagueTable(competitionId, seasonId) {
  const query = new URLSearchParams({
    competitionId: String(competitionId),
    seasonId: String(seasonId)
  });
  return requestStatsBomb(`/api/statsbomb/league-table?${query.toString()}`, { method: "GET" });
}

export function fetchStatsBombTeamSeasonStats(competitionId, seasonId) {
  const query = new URLSearchParams({
    competitionId: String(competitionId),
    seasonId: String(seasonId)
  });
  return requestStatsBomb(`/api/statsbomb/team-season-stats?${query.toString()}`, { method: "GET" });
}

export function fetchStatsBombPlayerSeasonStats(competitionId, seasonId) {
  const query = new URLSearchParams({
    competitionId: String(competitionId),
    seasonId: String(seasonId)
  });
  return requestStatsBomb(`/api/statsbomb/player-season-stats?${query.toString()}`, { method: "GET" });
}

export function importStatsBombClassicCsv(file) {
  const form = new FormData();
  form.append("file", file);
  return requestForm("/api/statsbomb/classic/import-csv", {
    method: "POST",
    body: form
  });
}

export function fetchStatsBombClassicDatasets() {
  return requestStatsBomb("/api/statsbomb/classic/datasets", { method: "GET" });
}

export function fetchStatsBombClassicPlayerStats(datasetId = "") {
  const query = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : "";
  return requestStatsBomb(`/api/statsbomb/classic/player-stats${query}`, { method: "GET" });
}

export function deleteStatsBombClassicDataset(datasetId) {
  return requestStatsBomb(`/api/statsbomb/classic/datasets/${encodeURIComponent(datasetId)}`, { method: "DELETE" });
}
