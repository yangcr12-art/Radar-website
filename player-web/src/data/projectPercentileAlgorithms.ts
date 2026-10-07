export const PERCENTILE_ALGORITHM_OPTIONS = [
  { value: "standard_positive", label: "普通正向" },
  { value: "standard_negative", label: "普通反向" },
  { value: "event_positive", label: "稀疏事件正向" },
  { value: "event_negative", label: "稀疏事件反向" },
  { value: "exclude", label: "不参与评分" }
] as const;

export type PercentileAlgorithm = (typeof PERCENTILE_ALGORITHM_OPTIONS)[number]["value"];

const ALGORITHM_ALIASES = new Map<string, PercentileAlgorithm>([
  ["standard_positive", "standard_positive"],
  ["普通正向", "standard_positive"],
  ["standard_negative", "standard_negative"],
  ["普通反向", "standard_negative"],
  ["event_positive", "event_positive"],
  ["稀疏事件正向", "event_positive"],
  ["event_negative", "event_negative"],
  ["稀疏事件反向", "event_negative"],
  ["exclude", "exclude"],
  ["不参与", "exclude"],
  ["不参与评分", "exclude"]
]);

const EXCLUDED_COLUMNS = new Set([
  "player",
  "team",
  "team within selected timeframe",
  "position",
  "age",
  "market value",
  "contract expires",
  "matches played",
  "minutes played",
  "birth country",
  "passport country",
  "foot",
  "height",
  "weight",
  "on loan"
]);

const EVENT_POSITIVE_COLUMNS = new Set([
  "goals",
  "goals per 90",
  "non-penalty goals",
  "non-penalty goals per 90",
  "head goals",
  "head goals per 90",
  "assists",
  "assists per 90",
  "second assists per 90",
  "third assists per 90",
  "clean sheets",
  "shot assists per 90",
  "smart passes per 90",
  "key passes per 90",
  "through passes per 90",
  "free kicks per 90",
  "direct free kicks per 90",
  "corners per 90",
  "penalties taken"
]);

const EVENT_NEGATIVE_COLUMNS = new Set([
  "yellow cards",
  "yellow cards per 90",
  "red cards",
  "red cards per 90",
  "conceded goals",
  "conceded goals per 90"
]);

const STANDARD_NEGATIVE_COLUMNS = new Set([
  "fouls per 90",
  "xg against",
  "xg against per 90",
  "losses per 90"
]);

function normalizeKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePercentileAlgorithm(
  value: unknown,
  fallback: PercentileAlgorithm = "standard_positive"
): PercentileAlgorithm {
  return ALGORITHM_ALIASES.get(String(value || "").trim().toLowerCase()) || fallback;
}

export function defaultPercentileAlgorithm(column: unknown): PercentileAlgorithm {
  const key = normalizeKey(column);
  if (EXCLUDED_COLUMNS.has(key)) return "exclude";
  if (EVENT_POSITIVE_COLUMNS.has(key)) return "event_positive";
  if (EVENT_NEGATIVE_COLUMNS.has(key)) return "event_negative";
  if (STANDARD_NEGATIVE_COLUMNS.has(key)) return "standard_negative";
  return "standard_positive";
}

export function percentileAlgorithmLabel(value: unknown) {
  const normalized = normalizePercentileAlgorithm(value);
  return PERCENTILE_ALGORITHM_OPTIONS.find((item) => item.value === normalized)?.label || "普通正向";
}
