// Shared display geometry; input values and statistical baselines are unchanged.

export function normalizeHexColor(value: unknown) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : "";
}

export function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function polygonPath(points: Array<{ x: number; y: number }>) {
  if (!Array.isArray(points) || points.length === 0) return "";
  return `${points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")} Z`;
}

export function colorToAlpha(hex: string, alpha = 0.22) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
