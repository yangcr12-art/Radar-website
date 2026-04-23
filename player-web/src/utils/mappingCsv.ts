export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取 CSV 失败"));
    reader.readAsText(file, "utf-8");
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      cells.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  cells.push(cur);
  return cells;
}

type ParseCsvOptions = {
  requiredHeaders: string[];
  optionalHeaders?: string[];
};

type ParsedCsvRow = Record<string, string>;

export function parseMappingCsv(text: string, options: ParseCsvOptions): { rows: ParsedCsvRow[]; error: string } {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return { rows: [], error: "CSV 至少要包含表头和一行数据。" };
  }

  const headers = splitCsvLine(lines[0]).map((item) => item.replace(/^\uFEFF/, "").trim());
  const missing = options.requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    return { rows: [], error: `缺少必填列: ${missing.join(", ")}` };
  }

  const allHeaders = [...options.requiredHeaders, ...(options.optionalHeaders || [])];
  const indexByHeader = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!indexByHeader.has(header)) {
      indexByHeader.set(header, index);
    }
  });

  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const row: ParsedCsvRow = {};
    allHeaders.forEach((header) => {
      const index = indexByHeader.get(header);
      row[header] = index === undefined ? "" : String(cells[index] || "").trim();
    });
    rows.push(row);
  }

  return { rows, error: "" };
}
