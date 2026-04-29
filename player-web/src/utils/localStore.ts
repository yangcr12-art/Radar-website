import { readScopedStore, writeScopedStore } from "./storageScope";

export function readLocalStore(key, fallbackValue) {
  return readScopedStore(key, fallbackValue);
}

export function writeLocalStore(key, value) {
  return writeScopedStore(key, value).ok;
}
