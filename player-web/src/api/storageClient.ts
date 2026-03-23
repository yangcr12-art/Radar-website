const DEFAULT_API_BASE = "http://127.0.0.1:8787";
const API_BASE = (import.meta.env.VITE_STORAGE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
const REQ_TIMEOUT_MS = 8000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...options,
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
      signal: controller.signal
    });

    let body = null;
    try {
      body = await resp.json();
    } catch {
      body = null;
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

export function getApiBase() {
  return API_BASE;
}

export function fetchState() {
  return request("/api/state", { method: "GET" });
}

export function saveState(data) {
  return request("/api/state", {
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

export function importMatchProjectExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return requestForm("/api/match-project-mapping/import-excel", {
    method: "POST",
    body: form
  });
}

export function importNameExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return requestForm("/api/name-mapping/import-excel", {
    method: "POST",
    body: form
  });
}

export function importProjectExcel(file) {
  const form = new FormData();
  form.append("file", file);
  return requestForm("/api/project-mapping/import-excel", {
    method: "POST",
    body: form
  });
}
