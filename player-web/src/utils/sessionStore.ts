import { buildScopedStorageKey } from "./storageScope";

// Tab-local UI state survives reloads without mixing accounts or browser tabs.
export function readSessionStore<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(buildScopedStorageKey(key));
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function writeSessionStore(key: string, value: unknown) {
  try {
    sessionStorage.setItem(buildScopedStorageKey(key), JSON.stringify(value));
  } catch {
    // Storage restrictions must not prevent navigation or editing.
  }
}
