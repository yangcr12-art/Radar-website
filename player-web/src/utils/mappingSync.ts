export const MAPPING_STORE_CHANGED_EVENT = "player_web_mapping_store_changed";

export function emitMappingStoreChanged(kind: string) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(MAPPING_STORE_CHANGED_EVENT, { detail: { kind: String(kind || "") } }));
}

export function subscribeMappingStoreChanged(listener: () => void) {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }
  const handler = () => listener();
  window.addEventListener(MAPPING_STORE_CHANGED_EVENT, handler as EventListener);
  return () => window.removeEventListener(MAPPING_STORE_CHANGED_EVENT, handler as EventListener);
}
