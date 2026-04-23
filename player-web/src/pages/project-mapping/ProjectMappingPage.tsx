import React, { useEffect, useRef, useState } from "react";
import { exportProjectMappingExcel, importProjectMappingExcel } from "../../api/storageClient";
import { parseMappingCsv, readTextFile } from "../../utils/mappingCsv";
import { getProjectMappingRows, hasProjectMappingColumn, saveProjectMappingRows } from "../../utils/projectMappingStore";
import { subscribeMappingStoreChanged } from "../../utils/mappingSync";

const FITNESS_ZH_BY_EN = {
  "Total Distance per 90": "每90分钟总距离",
  "Running Distance per 90 (15-20 km/h)": "每90分钟跑动距离（15-20 km/h）",
  "HSR Distance per 90 (20-25 km/h)": "每90分钟高速跑距离（20-25 km/h）",
  "Sprinting Distance per 90 (+25 km/h)": "每90分钟冲刺距离（+25 km/h）",
  "HI Distance per 90 (+20 km/h)": "每90分钟高强度距离（+20 km/h）",
  "Meter/Min": "每分钟距离",
  "Max Speed (km/h)": "最高速度（km/h）",
  "Count Medium Acceleration per 90 (1.5 m/s² to 3 m/s²)": "每90分钟中等加速次数（1.5 m/s² 至 3 m/s²）",
  "Count High Acceleration per 90 (+3 m/s²)": "每90分钟高强度加速次数（+3 m/s²）",
  "Count Medium Deceleration per 90 (-1.5 m/s² to -3 m/s²)": "每90分钟中等减速次数（-1.5 m/s² 至 -3 m/s²）",
  "Count High Deceleration per 90 (-3 m/s²)": "每90分钟高强度减速次数（-3 m/s²）",
  "Count HSR per 90 (20-25 km/h)": "每90分钟高速跑次数（20-25 km/h）",
  "Count Sprint per 90 (+25 km/h)": "每90分钟冲刺次数（+25 km/h）",
  "Count HI per 90 (+20 km/h)": "每90分钟高强度次数（+20 km/h）"
};

function normalizeColumnKey(text) {
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

function downloadBlobFile(filename, blob) {
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
  const body = rows.map((item) => [item.en, item.zh, item.group].map((value) => escapeCsvCell(value)).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

function ProjectMappingPage() {
  const csvInputRef = useRef(null);
  const excelInputRef = useRef(null);
  const [rows, setRows] = useState(() => getProjectMappingRows());
  const [importing, setImporting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const persistRows = (nextRows) => {
    const normalized = Array.isArray(nextRows) ? nextRows : [];
    saveProjectMappingRows(normalized);
    setRows(getProjectMappingRows());
  };

  useEffect(() => {
    return subscribeMappingStoreChanged(() => {
      setRows(getProjectMappingRows());
    });
  }, []);

  const hasDuplicateInRows = (targetValue, skipIndex) => {
    const targetKey = normalizeColumnKey(targetValue);
    if (!targetKey) return false;
    return rows.some((item, index) => index !== skipIndex && normalizeColumnKey(item.en) === targetKey);
  };

  const handleCellChange = (index, field, value) => {
    setError("");
    setMessage("");

    const current = rows[index];
    if (!current) return;
    if (current.isBuiltin && field !== "group") return;

    if (field === "en") {
      const nextKey = normalizeColumnKey(value);
      const currentKey = normalizeColumnKey(current.en);
      if (nextKey && nextKey !== currentKey && hasProjectMappingColumn(value)) {
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
    const enInput = window.prompt("请输入新增项目 English：", "");
    const en = String(enInput || "").trim();
    if (!en) return;

    if (hasProjectMappingColumn(en) || hasDuplicateInRows(en, -1)) {
      setError("项目 English 已存在，不能重复新增。");
      return;
    }

    const zhInput = window.prompt("请输入中文翻译（可留空）：", "");
    const zh = String(zhInput || "").trim();
    const nextRows = [...rows, { en, zh, group: "", isBuiltin: false }];
    persistRows(nextRows);
    setMessage("已新增项目。");
  };

  const handleDeleteRow = (index) => {
    setError("");
    setMessage("");

    const row = rows[index];
    if (!row) return;
    const confirmed = window.confirm(
      row.isBuiltin
        ? `确认删除已有项目 ${row.en} 吗？删除后仅在本页面隐藏，不影响已有映射逻辑。`
        : `确认删除新增项目 ${row.en} 吗？此操作不可撤销。`
    );
    if (!confirmed) return;

    const nextRows = rows.filter((_, idx) => idx !== index);
    persistRows(nextRows);
    setMessage(row.isBuiltin ? "已隐藏该已有项目。" : "已删除新增项目。");
  };

  const handleImportCsvClick = () => {
    setError("");
    setMessage("");
    csvInputRef.current?.click();
  };

  const handleImportExcelClick = () => {
    setError("");
    setMessage("");
    excelInputRef.current?.click();
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
        const key = normalizeColumnKey(en);
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
          zh: zh || String(FITNESS_ZH_BY_EN[en] || "").trim(),
          group,
          isBuiltin: !hasProjectMappingColumn(en)
        });
      }

      if (importedRows.length === 0) {
        setError("CSV 中没有可导入的项目行。");
        return;
      }

      persistRows(importedRows);
      setMessage(`CSV 导入完成：共写入 ${importedRows.length} 条项目。`);
    } catch (err) {
      setError(`导入失败：${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadCsv = () => {
    downloadFile("project_mapping_columns.csv", toCsv(rows), "text/csv;charset=utf-8");
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
      const res = await importProjectMappingExcel(file);
      const items = Array.isArray(res?.items) ? res.items : [];
      const columns = Array.isArray(res?.columns) ? res.columns : [];
      let importedRows = [];
      if (items.length > 0) {
        const seen = new Set();
        for (const item of items) {
          const en = String(item?.en || "").trim();
          const key = normalizeColumnKey(en);
          const zh = String(item?.zh || "").trim();
          const group = String(item?.group || "").trim();
          if (!en && !zh && !group) continue;
          if (!en || !key) {
            setError("Excel 中每一行都必须填写 English。");
            return;
          }
          if (seen.has(key)) {
            setError(`Excel 中存在重复 English：${en}`);
            return;
          }
          seen.add(key);
          importedRows.push({
            en,
            zh: zh || String(FITNESS_ZH_BY_EN[en] || "").trim(),
            group,
            isBuiltin: !hasProjectMappingColumn(en)
          });
        }
      } else {
        const seen = new Set();
        importedRows = columns
          .map((en) => String(en || "").trim())
          .filter((en) => {
            const key = normalizeColumnKey(en);
            if (!en || !key || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((en) => ({
            en,
            zh: String(FITNESS_ZH_BY_EN[en] || "").trim(),
            group: "体能",
            isBuiltin: !hasProjectMappingColumn(en)
          }));
      }

      if (importedRows.length === 0) {
        setError("Excel 中没有可导入的项目行。");
        return;
      }

      persistRows(importedRows);
      setMessage(`Excel 导入完成：共写入 ${importedRows.length} 条项目。`);
    } catch (err) {
      setError(`导入失败：${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadExcel = async () => {
    setError("");
    setMessage("");
    setExportingExcel(true);
    try {
      const blob = await exportProjectMappingExcel(rows);
      downloadBlobFile("project_mapping.xlsx", blob);
      setMessage("已下载项目对应表 Excel。");
    } catch (err) {
      setError(`导出失败：${err.message}`);
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <section className="info-page">
      <div className="info-card mapping-card">
        <h1>项目对应表</h1>
        <p>维护字段中英映射与分组，支持新增、删除，并同时支持 CSV/Excel 导入导出。</p>
        <div className="mapping-actions btn-row">
          <button onClick={handleImportCsvClick} disabled={importing}>
            {importing ? "导入中..." : "从 CSV 导入项目"}
          </button>
          <button onClick={handleImportExcelClick} disabled={importing}>
            {importing ? "导入中..." : "从 Excel 导入项目"}
          </button>
          <button onClick={handleAddRow}>新增项目</button>
          <button onClick={handleDownloadCsv}>下载对应表 CSV</button>
          <button onClick={handleDownloadExcel} disabled={exportingExcel}>
            {exportingExcel ? "导出中..." : "下载对应表 Excel"}
          </button>
        </div>
        <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden-file" onChange={handleImportCsvChange} />
        <input ref={excelInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden-file" onChange={handleImportExcelChange} />
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
                <tr key={`${item.isBuiltin ? "builtin" : "custom"}-${normalizeColumnKey(item.en)}-${index}`}>
                  <td>{index + 1}</td>
                  <td>
                    {item.isBuiltin ? (
                      item.en
                    ) : (
                      <input
                        value={item.en}
                        onChange={(e) => handleCellChange(index, "en", e.target.value)}
                        placeholder="例如：Total Distance per 90"
                      />
                    )}
                  </td>
                  <td>
                    {item.isBuiltin ? (
                      item.zh
                    ) : (
                      <input
                        value={item.zh}
                        onChange={(e) => handleCellChange(index, "zh", e.target.value)}
                        placeholder="例如：每90分钟总距离"
                      />
                    )}
                  </td>
                  <td>
                    <input
                      value={item.group}
                      onChange={(e) => handleCellChange(index, "group", e.target.value)}
                      placeholder="例如：体能 / 传球 / 防守"
                    />
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

export default ProjectMappingPage;
