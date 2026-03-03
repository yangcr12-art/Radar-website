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
