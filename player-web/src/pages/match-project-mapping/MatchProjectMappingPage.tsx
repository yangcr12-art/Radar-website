import React, { useRef, useState } from "react";
import { importMatchProjectExcel } from "../../api/storageClient";
import { getMatchProjectMappingRows, hasMatchProjectMappingColumn, saveMatchProjectMappingRows } from "../../utils/matchProjectMappingStore";

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

    setImporting(true);
    setError("");
    setMessage("");
    try {
      const res = await importMatchProjectExcel(file);
      const items = Array.isArray(res?.items) ? res.items : [];
      if (items.length === 0) {
        setError("未在 Excel 中识别到可导入的比赛项目。");
        return;
      }
      const existingKeySet = new Set(rows.map((row) => normalizeKey(row.en)));
      const addedRows = [];
      let skipped = 0;
      items.forEach((item) => {
        const en = String(item?.en || "").trim();
        const key = normalizeKey(en);
        if (!en || !key || existingKeySet.has(key)) {
          skipped += 1;
          return;
        }
        existingKeySet.add(key);
        addedRows.push({
          en,
          zh: String(item?.zh || "").trim(),
          group: String(item?.group || "").trim()
        });
      });
      if (addedRows.length === 0) {
        setMessage(`导入完成：新增 0 条，跳过 ${skipped} 条（来源 ${res?.sheet || "Sheet1"}）。`);
        return;
      }
      persistRows([...rows, ...addedRows]);
      const warnings = Array.isArray(res?.warnings) ? res.warnings.length : 0;
      setMessage(`导入完成：新增 ${addedRows.length} 条，跳过 ${skipped} 条（来源 ${res?.sheet || "Sheet1"}，warnings: ${warnings}）。`);
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
        <p>仅用于比赛总结数据的中英文映射与分组，不影响球员项目对应表。</p>
        <div className="mapping-actions btn-row">
          <button onClick={handleImportExcelClick} disabled={importing}>
            {importing ? "导入中..." : "从 Excel 导入比赛项目"}
          </button>
          <button onClick={handleAddRow}>新增项目</button>
          <button onClick={handleDownloadCsv}>下载对应表 CSV</button>
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden-file" onChange={handleImportExcelChange} />
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
