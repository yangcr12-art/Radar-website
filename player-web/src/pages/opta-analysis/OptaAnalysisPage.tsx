import React, { useEffect, useMemo, useRef, useState } from "react";
import { checkHealth, deleteOptaDataset, fetchOptaDataset, fetchOptaDatasets, getApiBaseLabel, importOptaPdf } from "../../api/storageClient";
import { STORAGE_KEYS } from "../../app/constants";
import { readLocalStore, writeLocalStore } from "../../utils/localStore";
import { formatDateTime } from "../../utils/timeFormat";

function parseNumericValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value || "").trim();
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").replace(/%/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function sortRowsByColumn(rows: any[], column: string) {
  if (!column) return rows;
  return rows
    .map((row: any, index: number) => ({ row, index }))
    .sort((a: any, b: any) => {
      const av = parseNumericValue(a?.row?.raw?.[column]);
      const bv = parseNumericValue(b?.row?.raw?.[column]);
      const aInvalid = av === null;
      const bInvalid = bv === null;
      if (aInvalid && bInvalid) return Number(a.index) - Number(b.index);
      if (aInvalid) return 1;
      if (bInvalid) return -1;
      const delta = Number(bv) - Number(av);
      if (delta !== 0) return delta;
      return Number(a.index) - Number(b.index);
    })
    .map((item: any) => item.row);
}

type OptaTableCardProps = {
  title: string;
  columns: string[];
  rows: any[];
  footnote: string;
  sortColumn: string;
  onSort: (column: string) => void;
};

function OptaTableCard({ title, columns, rows, footnote, sortColumn, onSort }: OptaTableCardProps) {
  return (
    <div className="fitness-card opta-table-card">
      <h2>{title}</h2>
      <div className="player-data-table-wrap fitness-table-wrap opta-table-scroll">
        <table className="player-data-table opta-data-table">
          <thead>
            <tr>
              {columns.map((column: string, index: number) => (
                <th key={column} className={index === 1 ? "opta-player-name-cell" : undefined}>
                  <button type="button" className={`opta-sort-btn${sortColumn === column ? " active" : ""}`} onClick={() => onSort(column)}>
                    {column}
                    {sortColumn === column ? " ↓" : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any) => (
              <tr key={String(row.id || "")}>
                {columns.map((column: string, index: number) => (
                  <td key={`${row.id}-${column}`} className={index === 1 ? "opta-player-name-cell" : undefined}>
                    {String(row?.raw?.[column] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="fitness-empty">暂无表格数据。</p> : null}
      </div>
      <div className="opta-footnote">
        <h3>字段说明</h3>
        <p>{footnote || "未识别到脚注说明。"}</p>
      </div>
    </div>
  );
}

function OptaAnalysisPage() {
  const apiBaseLabel = getApiBaseLabel();
  const [backendHealth, setBackendHealth] = useState("checking");
  const [datasetOptions, setDatasetOptions] = useState([] as any[]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(() => String(readLocalStore(STORAGE_KEYS.optaSelectedDatasetId, "") || ""));
  const [importSide, setImportSide] = useState(() => {
    const side = String(readLocalStore(STORAGE_KEYS.optaImportSide, "home") || "home").toLowerCase();
    return side === "away" ? "away" : "home";
  });
  const [datasetDoc, setDatasetDoc] = useState(null as any);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [attackSortColumn, setAttackSortColumn] = useState("");
  const [defenseSortColumn, setDefenseSortColumn] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const source = datasetDoc?.source || {};
  const attackTable = datasetDoc?.attackTable || {};
  const defenseTable = datasetDoc?.defenseTable || {};
  const attackColumns = Array.isArray(attackTable?.columns) ? attackTable.columns : [];
  const defenseColumns = Array.isArray(defenseTable?.columns) ? defenseTable.columns : [];
  const attackRowsRaw = Array.isArray(attackTable?.rows) ? attackTable.rows : [];
  const defenseRowsRaw = Array.isArray(defenseTable?.rows) ? defenseTable.rows : [];

  const attackRows = useMemo(() => sortRowsByColumn(attackRowsRaw, attackSortColumn), [attackRowsRaw, attackSortColumn]);
  const defenseRows = useMemo(() => sortRowsByColumn(defenseRowsRaw, defenseSortColumn), [defenseRowsRaw, defenseSortColumn]);

  const backendOnline = backendHealth === "online";

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.optaSelectedDatasetId, selectedDatasetId);
  }, [selectedDatasetId]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.optaImportSide, importSide);
  }, [importSide]);

  useEffect(() => {
    if (attackSortColumn && !attackColumns.includes(attackSortColumn)) setAttackSortColumn("");
  }, [attackSortColumn, attackColumns]);

  useEffect(() => {
    if (defenseSortColumn && !defenseColumns.includes(defenseSortColumn)) setDefenseSortColumn("");
  }, [defenseSortColumn, defenseColumns]);

  const verifyBackendHealth = async () => {
    try {
      await checkHealth();
      setBackendHealth("online");
      return true;
    } catch {
      setBackendHealth("offline");
      return false;
    }
  };

  const loadDatasets = async (preferredDatasetId = "") => {
    try {
      const res = await fetchOptaDatasets();
      const datasets = Array.isArray(res.datasets) ? res.datasets : [];
      setDatasetOptions(datasets);
      if (datasets.length === 0) {
        setSelectedDatasetId("");
        setDatasetDoc(null);
        return "";
      }
      const serverSelected = String(res.selectedDatasetId || "");
      const firstId = String(datasets[0]?.id || "");
      const fallbackId = serverSelected || firstId;
      const candidate = preferredDatasetId || selectedDatasetId;
      const matched = candidate && datasets.some((item: any) => item.id === candidate);
      const nextId = matched ? candidate : fallbackId;
      setSelectedDatasetId(nextId);
      return nextId;
    } catch (err: any) {
      setError(`数据集读取失败：${err.message}`);
      setDatasetOptions([]);
      setSelectedDatasetId("");
      setDatasetDoc(null);
      return "";
    }
  };

  const loadDatasetDetail = async (datasetId: string) => {
    if (!datasetId) {
      setDatasetDoc(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchOptaDataset(datasetId);
      setDatasetDoc(res.data || null);
    } catch (err: any) {
      setError(`数据读取失败：${err.message}`);
      setDatasetDoc(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verifyBackendHealth();
    loadDatasets();
  }, []);

  useEffect(() => {
    loadDatasetDetail(selectedDatasetId);
  }, [selectedDatasetId]);

  const onUploadClick = () => fileInputRef.current?.click();

  const onPdfChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage("");
    setError("");
    try {
      const backendReady = await verifyBackendHealth();
      if (!backendReady) throw new Error("后端未就绪：请先启动 player-web/server/app.py 并确认 /api/health 可访问");
      const res = await importOptaPdf(file, importSide);
      const sideLabel = String(res.sideRequested || importSide || "home").toLowerCase() === "away" ? "客队(第6页)" : "主队(第5页)";
      setMessage(`导入成功：${sideLabel}，球队 ${res.teamName || "-"}，进攻 ${res.attackRowCount} 行，防守 ${res.defenseRowCount} 行`);
      const nextDatasetId = await loadDatasets(String(res.datasetId || ""));
      await loadDatasetDetail(nextDatasetId);
      setAttackSortColumn("");
      setDefenseSortColumn("");
    } catch (err: any) {
      setError(`导入失败：${err.message}`);
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const handleDeleteDataset = async () => {
    if (!selectedDatasetId) return;
    if (!window.confirm("确认删除当前 Opta 数据集吗？删除后不可恢复。")) return;
    setMessage("");
    setError("");
    try {
      const res = await deleteOptaDataset(selectedDatasetId);
      const nextId = String(res.selectedDatasetId || "");
      const loadedId = await loadDatasets(nextId);
      await loadDatasetDetail(loadedId);
      setMessage("已删除当前 Opta 数据集。");
      setAttackSortColumn("");
      setDefenseSortColumn("");
    } catch (err: any) {
      setError(`删除失败：${err.message}`);
    }
  };

  return (
    <section className="info-page">
      <div className="info-card fitness-page-shell opta-page-shell">
        <h1>opta数据分析</h1>
        <p>上传 Opta PDF 后，可手动选择导入主队（第5页）或客队（第6页），并对进攻/防守概况表按列从大到小排序。</p>

        <div className="opta-top-bar">
          <select className="opta-top-control" value={selectedDatasetId} onChange={(e) => setSelectedDatasetId(e.target.value)} disabled={datasetOptions.length === 0}>
            {datasetOptions.length === 0 ? <option value="">暂无已导入 Opta 数据集</option> : null}
            {datasetOptions.map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <select className="opta-top-control" value={importSide} onChange={(e) => setImportSide(e.target.value === "away" ? "away" : "home")} disabled={importing}>
            <option value="home">主队（第5页）</option>
            <option value="away">客队（第6页）</option>
          </select>

          <button className="opta-top-control" onClick={onUploadClick} disabled={importing || !backendOnline}>
            {importing ? "导入中..." : backendOnline ? "导入 Opta PDF" : "后端未连接"}
          </button>

          <button className="opta-top-control" onClick={handleDeleteDataset} disabled={!selectedDatasetId || importing}>
            删除当前数据集
          </button>

          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden-file" onChange={onPdfChange} />
        </div>

        <div className="fitness-meta-row">
          <p>{`球队：${String(source?.teamName || "-")}`}</p>
          <p>{`页码：${String(source?.pageNumberUsed || "-")}`}</p>
          <p>{`进攻行数：${attackRowsRaw.length}`}</p>
          <p>{`防守行数：${defenseRowsRaw.length}`}</p>
          <p>{`更新时间：${formatDateTime(datasetDoc?.updatedAt) || "-"}`}</p>
        </div>

        {!backendOnline ? <p className="msg err">{`导入已禁用：后端未连接（当前 API：${apiBaseLabel}）`}</p> : null}
        {loading ? <p className="fitness-empty">数据加载中...</p> : null}
        {message ? <p className="msg ok">{message}</p> : null}
        {error ? <p className="msg err">{error}</p> : null}

        <div className="fitness-layout opta-layout">
          <div className="fitness-left-col">
            <OptaTableCard
              title={String(attackTable?.title || "进攻概况")}
              columns={attackColumns}
              rows={attackRows}
              footnote={String(attackTable?.footnote || "")}
              sortColumn={attackSortColumn}
              onSort={setAttackSortColumn}
            />
          </div>
          <div className="fitness-right-col">
            <OptaTableCard
              title={String(defenseTable?.title || "防守概况")}
              columns={defenseColumns}
              rows={defenseRows}
              footnote={String(defenseTable?.footnote || "")}
              sortColumn={defenseSortColumn}
              onSort={setDefenseSortColumn}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default OptaAnalysisPage;
