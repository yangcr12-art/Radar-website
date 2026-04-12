export function normalizeHexColor(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    return `#${text.slice(1).toLowerCase()}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return `#${text.slice(1).toLowerCase()}`;
  }
  return "";
}

