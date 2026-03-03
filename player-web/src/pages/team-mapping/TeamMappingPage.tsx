import React, { useMemo, useState } from "react";
import { fetchPlayerDataset, fetchPlayerDatasets } from "../../api/storageClient";
import { getTeamMappingRows, mergeTeamMappingRows, normalizeTeamName, saveTeamMappingRows } from "../../utils/teamMappingStore";

const SHAPE_OPTIONS = [
  { value: "circle", label: "圆形" },
  { value: "square", label: "方形" },
  { value: "triangle", label: "三角形" },
  { value: "diamond", label: "菱形" },
  { value: "cross", label: "十字" }
];

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value) {
  const text = String(value || "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  const header = "English,中文翻译,color,shape";
  const body = rows
    .map((item) => [item.en, item.zh, item.color, item.shape].map((value) => escapeCsvCell(value)).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

function normalizeHexColor(value) {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text;
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    const s = text.slice(1);
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toLowerCase();
  }
  return "";
}

function getRenderableColor(value) {
  return normalizeHexColor(value) || "#2f7fc4";
}

function ShapePreview({ shape, color }) {
  const fill = getRenderableColor(color);
  if (shape === "square") {
    return <rect x="6" y="6" width="16" height="16" fill={fill} stroke="#1f2937" strokeWidth="1" />;
  }
  if (shape === "triangle") {
    return <polygon points="14,5 23,22 5,22" fill={fill} stroke="#1f2937" strokeWidth="1" />;
  }
  if (shape === "diamond") {
    return <polygon points="14,4 24,14 14,24 4,14" fill={fill} stroke="#1f2937" strokeWidth="1" />;
  }
  if (shape === "cross") {
    return (
      <g stroke={fill} strokeWidth="3" strokeLinecap="round">
        <line x1="6" y1="14" x2="22" y2="14" />
        <line x1="14" y1="6" x2="14" y2="22" />
      </g>
    );
  }
  return <circle cx="14" cy="14" r="9" fill={fill} stroke="#1f2937" strokeWidth="1" />;
}

function pickTeamColumn(columns) {
  const list = Array.isArray(columns) ? columns.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const exact = list.find((name) => name.toLowerCase() === "team");
  if (exact) return exact;
  const byKeyword = list.find((name) => ["team", "club", "squad"].some((kw) => name.toLowerCase().includes(kw)));
  return byKeyword || "";
}

function extractTeamNamesFromDatasetDoc(doc) {
  const schemaColumns = Array.isArray(doc?.schema?.allColumns) ? doc.schema.allColumns : [];
  const players = Array.isArray(doc?.players) ? doc.players : [];
  const teamColumn = pickTeamColumn(schemaColumns);
  if (!teamColumn || players.length === 0) return [];

  const names = new Set();
  players.forEach((player) => {
    const raw = player?.raw || {};
    const name = normalizeTeamName(raw[teamColumn]);
    if (name) names.add(name);
  });
  return [...names];
}

function TeamMappingPage() {
  const [rows, setRows] = useState(() => {
    const loaded = getTeamMappingRows();
    return loaded.length > 0 ? loaded : [{ en: "", zh: "", color: "", shape: "" }];
  });

  const displayRows = useMemo(() => (rows.length > 0 ? rows : [{ en: "", zh: "", color: "", shape: "" }]), [rows]);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const persistRows = (nextRows) => {
    const normalized = Array.isArray(nextRows) ? nextRows : [];
    const withFallback = normalized.length > 0 ? normalized : [{ en: "", zh: "", color: "", shape: "" }];
    setRows(withFallback);
    saveTeamMappingRows(withFallback);
  };

  const handleCellChange = (index, field, value) => {
    setError("");
    setMessage("");
    persistRows(displayRows.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)));
  };

  const handleAddRow = () => {
    setError("");
    setMessage("");
    persistRows([...displayRows, { en: "", zh: "", color: "", shape: "" }]);
  };

  const handleDeleteRow = (index) => {
    setError("");
    setMessage("");
    persistRows(displayRows.filter((_, idx) => idx !== index));
  };

  const handleDownloadCsv = () => {
    downloadFile("team_mapping.csv", toCsv(displayRows), "text/csv;charset=utf-8");
  };

  const handleSyncTeamsFromPlayerData = async () => {
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const datasetsRes = await fetchPlayerDatasets();
      const datasets = Array.isArray(datasetsRes?.datasets) ? datasetsRes.datasets : [];
      if (datasets.length === 0) {
        setError("暂无已导入数据集，无法同步球队。");
        return;
      }

      const importedTeamSet = new Set();
      let inspectedCount = 0;
      let skippedCount = 0;
      for (const dataset of datasets) {
        const datasetId = String(dataset?.id || "");
        if (!datasetId) continue;
        try {
          const detail = await fetchPlayerDataset(datasetId);
          const names = extractTeamNamesFromDatasetDoc(detail?.data || null);
          names.forEach((name) => importedTeamSet.add(name));
          inspectedCount += 1;
        } catch {
          skippedCount += 1;
        }
      }

      const importedTeamNames = [...importedTeamSet].sort((a, b) => a.localeCompare(b, "en-US"));
      if (importedTeamNames.length === 0) {
        setError("未在数据集中识别到球队列或球队数据。");
        return;
      }

      const merged = mergeTeamMappingRows(displayRows, importedTeamNames);
      const beforeCount = displayRows.filter((row) => String(row.en || "").trim()).length;
      const afterCount = merged.filter((row) => String(row.en || "").trim()).length;
      const addedCount = Math.max(0, afterCount - beforeCount);
      persistRows(merged);
      setMessage(
        `同步完成：新增 ${addedCount} 支球队，当前共 ${afterCount} 支（读取数据集 ${inspectedCount} 个${skippedCount ? `，跳过 ${skippedCount} 个` : ""}）。`
      );
    } catch (err) {
      setError(`同步失败：${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="info-page">
      <div className="info-card mapping-card">
        <h1>球队对应表</h1>
        <p>维护球队英文名与中文名对应关系，支持从球员数据同步球队并本地保存。</p>
        <div className="mapping-actions">
          <button onClick={handleSyncTeamsFromPlayerData} disabled={syncing}>
            {syncing ? "同步中..." : "从球员数据同步球队"}
          </button>
          <button onClick={handleAddRow}>新增一行</button>
          <button onClick={handleDownloadCsv}>下载球队对应表 CSV</button>
        </div>
        {message ? <p className="msg ok">{message}</p> : null}
        {error ? <p className="msg err">{error}</p> : null}
        <div className="mapping-table-wrap">
          <table className="mapping-table">
            <thead>
              <tr>
                <th>#</th>
                <th>English</th>
                <th>中文翻译</th>
                <th>颜色</th>
                <th>颜色示意</th>
                <th>形状</th>
                <th>形状示意</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((item, index) => (
                <tr key={`team-row-${index}`}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      value={item.en}
                      onChange={(e) => handleCellChange(index, "en", e.target.value)}
                      placeholder="例如：Tianjin Tigers"
                    />
                  </td>
                  <td>
                    <input
                      value={item.zh}
                      onChange={(e) => handleCellChange(index, "zh", e.target.value)}
                      placeholder="例如：天津津门虎"
                    />
                  </td>
                  <td>
                    <div className="team-color-editor">
                      <input
                        type="color"
                        value={getRenderableColor(item.color)}
                        onChange={(e) => handleCellChange(index, "color", e.target.value)}
                        className="team-color-picker"
                      />
                      <input
                        value={item.color || ""}
                        onChange={(e) => handleCellChange(index, "color", e.target.value)}
                        placeholder="例如：#2f7fc4"
                      />
                    </div>
                  </td>
                  <td>
                    <span className="team-color-preview" style={{ background: getRenderableColor(item.color) }} />
                  </td>
                  <td>
                    <select value={item.shape || "circle"} onChange={(e) => handleCellChange(index, "shape", e.target.value)}>
                      {SHAPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <svg className="team-shape-preview" viewBox="0 0 28 28" aria-label="shape preview">
                      <ShapePreview shape={item.shape || "circle"} color={item.color} />
                    </svg>
                  </td>
                  <td>
                    <button className="danger" onClick={() => handleDeleteRow(index)} disabled={displayRows.length <= 1}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default TeamMappingPage;
