export const MAPPING_REMOTE_SYNC_EVENT = "player_web_mapping_remote_sync";

export function emitMappingRemoteSyncStatus(detail: { ok: boolean; error: string }) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(
    new CustomEvent(MAPPING_REMOTE_SYNC_EVENT, {
      detail: {
        ok: Boolean(detail?.ok),
        error: String(detail?.error || "")
      }
    })
  );
}

export function subscribeMappingRemoteSyncStatus(listener: (detail: { ok: boolean; error: string }) => void) {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail || {};
    listener({
      ok: Boolean(detail.ok),
      error: String(detail.error || "")
    });
  };
  window.addEventListener(MAPPING_REMOTE_SYNC_EVENT, handler as EventListener);
  return () => window.removeEventListener(MAPPING_REMOTE_SYNC_EVENT, handler as EventListener);
}
