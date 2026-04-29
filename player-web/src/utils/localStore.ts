import { readScopedStore, writeScopedStore } from "./storageScope";

export function readLocalStore(key, fallbackValue) {
  return readScopedStore(key, fallbackValue);
}

export function writeLocalStoreWithResult(key, value) {
  return writeScopedStore(key, value);
}

export function writeLocalStore(key, value) {
  return writeLocalStoreWithResult(key, value).ok;
}
