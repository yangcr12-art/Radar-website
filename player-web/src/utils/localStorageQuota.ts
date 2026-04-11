export function isQuotaExceededResult(result) {
  if (!result || result.ok) return false;
  const text = `${result.name || ""} ${result.error || ""}`.toLowerCase();
  return text.includes("quotaexceeded");
}

export function compactSnapshotForLocalStorage(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const centerImage = snapshot.centerImage && typeof snapshot.centerImage === "object"
    ? { ...snapshot.centerImage, src: "" }
    : snapshot.centerImage;
  const cornerImage = snapshot.cornerImage && typeof snapshot.cornerImage === "object"
    ? { ...snapshot.cornerImage, src: "" }
    : snapshot.cornerImage;
  return { ...snapshot, centerImage, cornerImage };
}

export function compactPresetsForLocalStorage(input, maxCount = 12) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) => item && typeof item === "object")
    .slice()
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, maxCount)
    .map((item) => ({
      ...item,
      payload: compactSnapshotForLocalStorage(item.payload)
    }));
}
