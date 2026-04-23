import React, { useEffect, useRef, useState } from "react";
import { parseMappingCsv, readTextFile } from "../../utils/mappingCsv";
import { getMatchProjectMappingRows, hasMatchProjectMappingColumn, saveMatchProjectMappingRows } from "../../utils/matchProjectMappingStore";
import { subscribeMappingStoreChanged } from "../../utils/mappingSync";

function normalizeKey(text) {
  return String(text || "").trim().toLowerCase();
}

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
  const header = "English,中文翻译,group";
  const body = rows.map((item) => [item.en, item.zh, item.group].map((v) => escapeCsvCell(v)).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

function MatchProjectMappingPage() {
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState(() => getMatchProjectMappingRows());
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const persistRows = (nextRows) => {
    saveMatchProjectMappingRows(nextRows);
    setRows(getMatchProjectMappingRows());
  };

  useEffect(() => {
    return subscribeMappingStoreChanged(() => {
      setRows(getMatchProjectMappingRows());
    });
  }, []);

  const hasDuplicateInRows = (targetValue, skipIndex) => {
    const targetKey = normalizeKey(targetValue);
    if (!targetKey) return false;
    return rows.some((item, index) => index !== skipIndex && normalizeKey(item.en) === targetKey);
  };

  const handleCellChange = (index, field, value) => {
    setError("");
    setMessage("");
    const current = rows[index];
    if (!current) return;

    if (field === "en") {
      const nextKey = normalizeKey(value);
      const currentKey = normalizeKey(current.en);
      if (nextKey && nextKey !== currentKey && hasMatchProjectMappingColumn(value)) {
        setError("项目 English 已存在，不能重复。");
        return;
      }
      if (hasDuplicateInRows(value, index)) {
        setError("当前表格中存在重复 English 项目。");
        return;
      }
    }

    const nextRows = rows.map((row, idx) => (idx === index ? { ...row, [field]: value } : row));
    persistRows(nextRows);
  };

  const handleAddRow = () => {
    setError("");
    setMessage("");
    const enInput = window.prompt("请输入新增比赛项目 English：", "");
    const en = String(enInput || "").trim();
    if (!en) return;
    if (hasMatchProjectMappingColumn(en) || hasDuplicateInRows(en, -1)) {
      setError("项目 English 已存在，不能重复新增。");
      return;
    }
    const zhInput = window.prompt("请输入中文翻译（可留空）：", "");
    const zh = String(zhInput || "").trim();
    const nextRows = [...rows, { en, zh, group: "" }];
    persistRows(nextRows);
    setMessage("已新增比赛项目。");
  };

  const handleDeleteRow = (index) => {
    const row = rows[index];
    if (!row) return;
    if (!window.confirm(`确认删除 ${row.en} 吗？此操作不可撤销。`)) return;
    const nextRows = rows.filter((_, idx) => idx !== index);
    persistRows(nextRows);
    setMessage("已删除项目。");
    setError("");
  };

  const handleImportCsvClick = () => {
    setError("");
    setMessage("");
    fileInputRef.current?.click();
  };

  const handleImportCsvChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!String(file.name || "").toLowerCase().endsWith(".csv")) {
      setError("仅支持 .csv 文件。");
      return;
    }

    setImporting(true);
    setError("");
    setMessage("");
    try {
      const csvText = await readTextFile(file);
      const parsed = parseMappingCsv(csvText, {
        requiredHeaders: ["English", "中文翻译", "group"]
      });
      if (parsed.error) {
        setError(parsed.error);
        return;
      }

      const seen = new Set();
      const importedRows = [];
      for (const item of parsed.rows) {
        const en = String(item?.English || "").trim();
        const key = normalizeKey(en);
        const zh = String(item?.中文翻译 || "").trim();
        const group = String(item?.group || "").trim();
        if (!en && !zh && !group) continue;
        if (!en || !key) {
          setError("CSV 中每一行都必须填写 English。");
          return;
        }
        if (seen.has(key)) {
          setError(`CSV 中存在重复 English：${en}`);
          return;
        }
        seen.add(key);
        importedRows.push({
          en,
          zh,
          group
        });
      }

      if (importedRows.length === 0) {
        setError("CSV 中没有可导入的比赛项目行。");
        return;
      }

      persistRows(importedRows);
      setMessage(`CSV 导入完成：共写入 ${importedRows.length} 条比赛项目。`);
    } catch (err) {
      setError(`导入失败：${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadCsv = () => {
    downloadFile("match_project_mapping_columns.csv", toCsv(rows), "text/csv;charset=utf-8");
  };

  return (
    <section className="info-page">
      <div className="info-card mapping-card">
        <h1>比赛项目对应表</h1>
        <p>仅用于比赛总结数据的中英文映射与分组，不影响球员项目对应表；导入导出统一使用 CSV。</p>
        <div className="mapping-actions btn-row">
          <button onClick={handleImportCsvClick} disabled={importing}>
            {importing ? "导入中..." : "从 CSV 导入比赛项目"}
          </button>
          <button onClick={handleAddRow}>新增项目</button>
          <button onClick={handleDownloadCsv}>下载对应表 CSV</button>
        </div>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden-file" onChange={handleImportCsvChange} />
        {message ? <p className="msg ok">{message}</p> : null}
        {error ? <p className="msg err">{error}</p> : null}
        <div className="mapping-table-wrap">
          <table className="mapping-table">
            <thead>
              <tr>
                <th>#</th>
                <th>English</th>
                <th>中文翻译</th>
                <th>group</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => (
                <tr key={`${normalizeKey(item.en)}-${index}`}>
                  <td>{index + 1}</td>
                  <td>
                    <input value={item.en} onChange={(e) => handleCellChange(index, "en", e.target.value)} />
                  </td>
                  <td>
                    <input value={item.zh} onChange={(e) => handleCellChange(index, "zh", e.target.value)} />
                  </td>
                  <td>
                    <input value={item.group} onChange={(e) => handleCellChange(index, "group", e.target.value)} />
                  </td>
                  <td>
                    <button className="danger" onClick={() => handleDeleteRow(index)}>
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

export default MatchProjectMappingPage;
