function normalizeText(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeImportedGroupName(groupText) {
  const raw = String(groupText || "").trim();
  if (!raw) return "其他";
  const key = normalizeText(raw);
  const mapped = {
    passing: "传球",
    pass: "传球",
    duel: "对抗",
    duels: "对抗",
    defending: "防守",
    defense: "防守",
    other: "其他",
    传球: "传球",
    对抗: "对抗",
    防守: "防守",
    其他: "其他"
  };
  return mapped[key] || raw;
}

export function buildImportedGroupOrderMap(rows) {
  const priority = ["传球", "对抗", "防守", "其他"];
  const seen = new Set(rows.map((row) => String(row.group || "").trim()).filter(Boolean));
  const ordered = [];
  priority.forEach((group) => {
    if (!seen.has(group)) return;
    ordered.push(group);
    seen.delete(group);
  });
  rows.forEach((row) => {
    const group = String(row.group || "").trim();
    if (!group || !seen.has(group)) return;
    ordered.push(group);
    seen.delete(group);
  });
  return new Map(ordered.map((group, index) => [group, index + 1]));
}
