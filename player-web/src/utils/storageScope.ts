const STORAGE_SCOPE_SESSION_KEY = "player_web_storage_scope_session_v1";
const DEFAULT_SCOPE = "anonymous";

let currentScope = DEFAULT_SCOPE;

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function normalizeScope(scope: string) {
  const text = String(scope || "").trim().toLowerCase();
  const normalized = text.replace(/[^a-z0-9._-]+/g, "_").replace(/^[_\-.]+|[_\-.]+$/g, "");
  return normalized || DEFAULT_SCOPE;
}

function readStoredScope() {
  if (!canUseSessionStorage()) return DEFAULT_SCOPE;
  try {
    return normalizeScope(window.sessionStorage.getItem(STORAGE_SCOPE_SESSION_KEY) || DEFAULT_SCOPE);
  } catch {
    return DEFAULT_SCOPE;
  }
}

currentScope = readStoredScope();

export function getStorageScope() {
  return currentScope || DEFAULT_SCOPE;
}

export function setStorageScope(scope: string) {
  currentScope = normalizeScope(scope);
  if (!canUseSessionStorage()) return currentScope;
  try {
    window.sessionStorage.setItem(STORAGE_SCOPE_SESSION_KEY, currentScope);
  } catch {
    // Ignore sessionStorage failures and keep the in-memory scope.
  }
  return currentScope;
}

export function buildScopedStorageKey(key: string) {
  return `${String(key || "").trim()}::${getStorageScope()}`;
}

export function readScopedStore<T>(key: string, fallbackValue: T): T {
  try {
    const scopedRaw = localStorage.getItem(buildScopedStorageKey(key));
    if (scopedRaw) {
      return JSON.parse(scopedRaw) as T;
    }
    const legacyRaw = localStorage.getItem(key);
    return legacyRaw ? (JSON.parse(legacyRaw) as T) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

export function writeScopedStore(key: string, value: unknown) {
  try {
    localStorage.setItem(buildScopedStorageKey(key), JSON.stringify(value));
    return { ok: true, error: "", name: "" };
  } catch (err) {
    const name = err && typeof err === "object" && typeof err.name === "string" ? err.name : "UnknownError";
    const message = err && typeof err === "object" && typeof err.message === "string" ? err.message : "";
    return { ok: false, error: message ? `${name}: ${message}` : name, name };
  }
}
