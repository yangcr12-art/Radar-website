import React, { useMemo, useRef, useState } from "react";
import { fetchPlayerDataset, fetchPlayerDatasets, importNameExcel } from "../../api/storageClient";
import { getTeamMappingRowsByEnglish, normalizeTeamName } from "../../utils/teamMappingStore";
import { getNameMappingRows, mergeNameMappingRows, normalizePlayerName, saveNameMappingRows } from "../../utils/nameMappingStore";
import { transliteratePlayerName } from "../../utils/nameTransliteration";

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
  const header = "English,中文翻译,球队";
  const body = rows.map((item) => [item.en, item.zh, item.team].map((value) => escapeCsvCell(value)).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

function extractPlayerNamesFromDatasetDoc(doc) {
  const players = Array.isArray(doc?.players) ? doc.players : [];
  if (players.length === 0) return [];

  const names = new Set();
  players.forEach((player) => {
    const name = normalizePlayerName(player?.name || player?.id || "");
    if (name) names.add(name);
  });
  return [...names];
}

function NameMappingPage() {
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState(() => {
    const loaded = getNameMappingRows();
    return loaded.length > 0 ? loaded : [{ en: "", zh: "", team: "" }];
  });
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const displayRows = useMemo(() => (rows.length > 0 ? rows : [{ en: "", zh: "", team: "" }]), [rows]);

  const persistRows = (nextRows) => {
    const normalized = Array.isArray(nextRows) ? nextRows : [];
    const withFallback = normalized.length > 0 ? normalized : [{ en: "", zh: "", team: "" }];
    setRows(withFallback);
    saveNameMappingRows(withFallback);
  };

  const handleCellChange = (index, field, value) => {
    setError("");
    setMessage("");
    persistRows(displayRows.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)));
  };

  const handleAddRow = () => {
    setError("");
    setMessage("");
    persistRows([...displayRows, { en: "", zh: "", team: "" }]);
  };

  const handleDeleteRow = (index) => {
    setError("");
    setMessage("");
    persistRows(displayRows.filter((_, idx) => idx !== index));
  };

  const handleDownloadCsv = () => {
    downloadFile("name_mapping.csv", toCsv(displayRows), "text/csv;charset=utf-8");
  };

  const handleSortByTeam = () => {
    setError("");
    setMessage("");
    const sorted = [...displayRows].sort((a, b) => {
      const teamA = String(a?.team || "").trim();
      const teamB = String(b?.team || "").trim();
      const emptyA = teamA ? 0 : 1;
      const emptyB = teamB ? 0 : 1;
      if (emptyA !== emptyB) return emptyA - emptyB;
      const byTeam = teamA.localeCompare(teamB, "zh-CN");
      if (byTeam !== 0) return byTeam;
      return String(a?.en || "").trim().localeCompare(String(b?.en || "").trim(), "en-US");
    });
    persistRows(sorted);
    setMessage("已按球队排序（仅调整顺序，不修改内容）。");
  };

  const handleClearAllNames = () => {
    const hasData = displayRows.some((row) => String(row.en || "").trim() || String(row.zh || "").trim() || String(row.team || "").trim());
    if (!hasData) {
      setMessage("当前姓名对应表为空，无需删除。");
      setError("");
      return;
    }
    const confirmed = window.confirm("确认删除当前姓名对应表里的所有姓名吗？此操作不可撤销。");
    if (!confirmed) return;
    persistRows([{ en: "", zh: "", team: "" }]);
    setMessage("已删除现有姓名。");
    setError("");
  };

  const handleImportExcelClick = () => {
    setError("");
    setMessage("");
    fileInputRef.current?.click();
  };

  const handleImportExcelChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!String(file.name || "").toLowerCase().endsWith(".xlsx")) {
      setError("仅支持 .xlsx 文件。");
      return;
    }

    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const res = await importNameExcel(file);
      const importedItems = Array.isArray(res?.items) && res.items.length > 0
        ? res.items
        : (Array.isArray(res?.names) ? res.names : []).map((name) => ({ name, teamEn: "" }));
      if (importedItems.length === 0) {
        setError("未在 Excel 中识别到有效姓名。");
        return;
      }

      const translatedByEn = new Map();
      displayRows.forEach((row) => {
        const key = normalizePlayerName(row.en).toLowerCase();
        const zh = String(row.zh || "").trim();
        if (!key || !zh || translatedByEn.has(key)) return;
        translatedByEn.set(key, zh);
      });
      const teamMapping = getTeamMappingRowsByEnglish();

      const nextRows = [...displayRows];
      const rowIndexByEn = new Map();
      nextRows.forEach((row, index) => {
        const key = normalizePlayerName(row.en).toLowerCase();
        if (!key || rowIndexByEn.has(key)) return;
        rowIndexByEn.set(key, index);
      });

      let addedCount = 0;
      let filledCount = 0;
      let filledTeamCount = 0;
      let skippedCount = 0;
      importedItems.forEach((item) => {
        const en = normalizePlayerName(item?.name);
        const key = en.toLowerCase();
        if (!en) return;
        const mappedZh = translatedByEn.get(key) || "";
        const autoZh = mappedZh || transliteratePlayerName(en) || "";
        const teamKey = normalizeTeamName(item?.teamEn || "").toLowerCase();
        const teamZh = String(teamMapping.get(teamKey)?.zh || "").trim();
        if (!rowIndexByEn.has(key)) {
          nextRows.push({ en, zh: autoZh, team: teamZh });
          rowIndexByEn.set(key, nextRows.length - 1);
          addedCount += 1;
          if (autoZh) filledCount += 1;
          if (teamZh) filledTeamCount += 1;
          return;
        }

        const hitIndex = rowIndexByEn.get(key);
        const current = nextRows[hitIndex];
        const currentZh = String(current?.zh || "").trim();
        const currentTeam = String(current?.team || "").trim();
        let didWrite = false;
        let nextRow = current;
        if (!currentZh && autoZh) {
          nextRow = { ...nextRow, zh: autoZh };
          filledCount += 1;
          didWrite = true;
        }
        if (!currentTeam && teamZh) {
          nextRow = { ...nextRow, team: teamZh };
          filledTeamCount += 1;
          didWrite = true;
        }
        if (didWrite) {
          nextRows[hitIndex] = nextRow;
        } else {
          skippedCount += 1;
        }
      });

      persistRows(nextRows);
      setMessage(
        `导入完成：新增 ${addedCount} 条，补全中文 ${filledCount} 条，补全球队 ${filledTeamCount} 条，跳过 ${skippedCount} 条（来源 ${res?.sheet || "Sheet1"} / ${res?.column || "Player"}${res?.teamColumn ? ` / ${res.teamColumn}` : ""}）。`
      );
    } catch (err) {
      setError(`导入失败：${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncNamesFromPlayerData = async () => {
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const datasetsRes = await fetchPlayerDatasets();
      const datasets = Array.isArray(datasetsRes?.datasets) ? datasetsRes.datasets : [];
      if (datasets.length === 0) {
        setError("暂无已导入数据集，无法同步姓名。");
        return;
      }

      const importedNameSet = new Set();
      let inspectedCount = 0;
      let skippedCount = 0;

      for (const dataset of datasets) {
        const datasetId = String(dataset?.id || "");
        if (!datasetId) continue;
        try {
          const detail = await fetchPlayerDataset(datasetId);
          const names = extractPlayerNamesFromDatasetDoc(detail?.data || null);
          names.forEach((name) => importedNameSet.add(name));
          inspectedCount += 1;
        } catch {
          skippedCount += 1;
        }
      }

      const importedNames = [...importedNameSet].sort((a, b) => a.localeCompare(b, "en-US"));
      if (importedNames.length === 0) {
        setError("未在数据集中识别到球员姓名。");
        return;
      }

      const merged = mergeNameMappingRows(displayRows, importedNames);
      const beforeCount = displayRows.filter((row) => String(row.en || "").trim()).length;
      const afterCount = merged.filter((row) => String(row.en || "").trim()).length;
      const addedCount = Math.max(0, afterCount - beforeCount);
      persistRows(merged);
      setMessage(
        `同步完成：新增 ${addedCount} 条姓名，当前共 ${afterCount} 条（读取数据集 ${inspectedCount} 个${skippedCount ? `，跳过 ${skippedCount} 个` : ""}）。`
      );
    } catch (err) {
      setError(`同步失败：${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleFillChineseNames = () => {
    setError("");
    setMessage("");
    let filledCount = 0;
    const nextRows = displayRows.map((row) => {
      const currentZh = String(row.zh || "").trim();
      if (currentZh) return row;
      const autoZh = transliteratePlayerName(row.en);
      if (!autoZh) return row;
      filledCount += 1;
      return { ...row, zh: autoZh };
    });
    if (filledCount === 0) {
      setMessage("未找到可自动补全的中文姓名。");
      return;
    }
    persistRows(nextRows);
    setMessage(`已批量补全 ${filledCount} 条中文姓名。`);
  };

  return (
    <section className="info-page">
      <div className="info-card mapping-card">
        <h1>姓名对应表</h1>
        <p>维护球员英文名与中文名对应关系，支持从球员数据同步姓名并本地保存。</p>
        <div className="mapping-actions">
          <button onClick={handleImportExcelClick} disabled={syncing}>
            {syncing ? "处理中..." : "导入姓名 Excel"}
          </button>
          <button onClick={handleSyncNamesFromPlayerData} disabled={syncing}>
            {syncing ? "同步中..." : "从球员数据同步姓名"}
          </button>
          <button onClick={handleFillChineseNames} disabled={syncing}>
            批量补全中文名
          </button>
          <button onClick={handleAddRow}>新增一行</button>
          <button className="danger" onClick={handleClearAllNames} disabled={syncing}>
            删除现有姓名
          </button>
          <button onClick={handleDownloadCsv}>下载姓名对应表 CSV</button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: "none" }}
          onChange={handleImportExcelChange}
        />
        {message ? <p className="msg ok">{message}</p> : null}
        {error ? <p className="msg err">{error}</p> : null}
        <div className="mapping-table-wrap">
          <table className="mapping-table">
            <thead>
              <tr>
                <th>#</th>
                <th>English</th>
                <th>中文翻译</th>
                <th>
                  <div className="table-header-actions">
                    <span>球队</span>
                    <button type="button" onClick={handleSortByTeam} disabled={syncing}>
                      按球队排序
                    </button>
                  </div>
                </th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((item, index) => (
                <tr key={`name-row-${index}`}>
                  <td>{index + 1}</td>
                  <td>
                    <input value={item.en} onChange={(e) => handleCellChange(index, "en", e.target.value)} placeholder="例如：Sergio Postigo" />
                  </td>
                  <td>
                    <input value={item.zh} onChange={(e) => handleCellChange(index, "zh", e.target.value)} placeholder="例如：塞尔吉奥·波斯蒂戈" />
                  </td>
                  <td>
                    <input value={item.team || ""} onChange={(e) => handleCellChange(index, "team", e.target.value)} placeholder="例如：天津津门虎" />
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

export default NameMappingPage;
