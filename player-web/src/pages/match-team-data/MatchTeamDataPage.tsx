import React, { useEffect, useMemo, useRef, useState } from "react";
import { checkHealth, deleteMatchDataset, fetchMatchDatasets, fetchMatchTeamById, fetchMatchTeamList, importMatchExcel } from "../../api/storageClient";
import { METRIC_GROUP_RULES, STORAGE_KEYS } from "../../app/constants";
import { buildImportedGroupOrderMap, normalizeImportedGroupName } from "../../utils/importGroupOrder";
import { readLocalStore, writeLocalStore } from "../../utils/localStore";
import { getMatchProjectGroupByColumn, getMatchProjectZhByColumn } from "../../utils/matchProjectMappingStore";
import { formatDateTime } from "../../utils/timeFormat";

function computeTier(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "avg";
  if (num >= 90) return "elite";
  if (num >= 65) return "above_avg";
  if (num >= 34) return "avg";
  return "bottom";
}

function formatColumnLabel(column) {
  const en = String(column || "").trim();
  const zh = getMatchProjectZhByColumn(en);
  if (zh && zh !== en) return `${zh} (${en})`;
  return en;
}

function inferMetricGroupAndOrder(column, metricText = "") {
  const text = `${String(column || "")} ${String(metricText || "")}`.toLowerCase().trim();
  for (const rule of METRIC_GROUP_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return { group: rule.group, order: rule.order };
    }
  }
  return { group: "其他", order: 4 };
}

function MatchTeamDataPage() {
  const [backendHealth, setBackendHealth] = useState("checking");
  const [dataMeta, setDataMeta] = useState({ teamCount: 0, updatedAt: "", numericColumns: [] as string[] });
  const [datasetOptions, setDatasetOptions] = useState([] as any[]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [teamOptions, setTeamOptions] = useState([] as any[]);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedTeamDetail, setSelectedTeamDetail] = useState(null as any);
  const [matchDataLoading, setMatchDataLoading] = useState(false);
  const [matchDataImporting, setMatchDataImporting] = useState(false);
  const [matchDataMessage, setMatchDataMessage] = useState("");
  const [matchDataError, setMatchDataError] = useState("");
  const [detailReloadTick, setDetailReloadTick] = useState(0);
  const [metricSelectionsByDataset, setMetricSelectionsByDataset] = useState(() => readLocalStore(STORAGE_KEYS.matchMetricSelectionsByDataset, {}));
  const [teamSearchByDataset, setTeamSearchByDataset] = useState(() => readLocalStore(STORAGE_KEYS.matchTeamSearchByDataset, {}));
  const [selectedTeamByDataset, setSelectedTeamByDataset] = useState(() => readLocalStore(STORAGE_KEYS.matchSelectedTeamByDataset, {}));
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const filteredTeamOptions = useMemo(() => {
    const keyword = teamSearchQuery.trim().toLowerCase();
    if (!keyword) return teamOptions;
    return teamOptions.filter((item) => String(item.team || "").toLowerCase().includes(keyword));
  }, [teamOptions, teamSearchQuery]);

  const selectedMetricColumns = useMemo(() => {
    if (!selectedDatasetId) return [];
    const selected = Array.isArray(metricSelectionsByDataset[selectedDatasetId]) ? metricSelectionsByDataset[selectedDatasetId] : [];
    return selected.filter((col) => dataMeta.numericColumns.includes(col));
  }, [selectedDatasetId, metricSelectionsByDataset, dataMeta.numericColumns]);

  const selectedTeamName = useMemo(() => {
    if (selectedTeamDetail?.team) return String(selectedTeamDetail.team);
    const found = teamOptions.find((item) => item.id === selectedTeamId);
    return found?.team || "";
  }, [selectedTeamDetail, teamOptions, selectedTeamId]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.matchMetricSelectionsByDataset, metricSelectionsByDataset);
  }, [metricSelectionsByDataset]);
  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.matchTeamSearchByDataset, teamSearchByDataset);
  }, [teamSearchByDataset]);
  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.matchSelectedTeamByDataset, selectedTeamByDataset);
  }, [selectedTeamByDataset]);

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
    setMatchDataError("");
    try {
      const res = await fetchMatchDatasets();
      const datasets = Array.isArray(res.datasets) ? res.datasets : [];
      setDatasetOptions(datasets);
      if (datasets.length === 0) {
        setSelectedDatasetId("");
        return "";
      }
      const serverSelected = String(res.selectedDatasetId || "");
      const firstId = String(datasets[0]?.id || "");
      const fallbackId = serverSelected || firstId;
      const matchedPreferred = preferredDatasetId && datasets.some((d) => d.id === preferredDatasetId);
      const nextId = matchedPreferred ? preferredDatasetId : fallbackId;
      setSelectedDatasetId(nextId);
      return nextId;
    } catch (err: any) {
      setMatchDataError(`数据集读取失败：${err.message}`);
      setDatasetOptions([]);
      setSelectedDatasetId("");
      return "";
    }
  };

  const loadTeamList = async (datasetId: string, preferredTeamId = "") => {
    setMatchDataLoading(true);
    setMatchDataError("");
    try {
      if (!datasetId) {
        setTeamOptions([]);
        setSelectedTeamId("");
        setSelectedTeamDetail(null);
        setDataMeta({ teamCount: 0, updatedAt: "", numericColumns: [] });
        return;
      }
      const res = await fetchMatchTeamList(datasetId);
      const options = Array.isArray(res.teams) ? res.teams : [];
      setTeamOptions(options);
      setDataMeta({
        teamCount: Number(res.teamCount || options.length),
        updatedAt: res.updatedAt || "",
        numericColumns: Array.isArray(res.numericColumns) ? res.numericColumns : []
      });
      if (options.length === 0) {
        setSelectedTeamId("");
        setSelectedTeamDetail(null);
        setDetailReloadTick((n) => n + 1);
        return;
      }
      const hasPreferred = preferredTeamId && options.some((item) => item.id === preferredTeamId);
      const nextId = hasPreferred ? preferredTeamId : options[0].id;
      if (nextId !== selectedTeamId) setSelectedTeamId(nextId);
      else setDetailReloadTick((n) => n + 1);
    } catch (err: any) {
      setMatchDataError(`球队数据读取失败：${err.message}`);
      setTeamOptions([]);
      setSelectedTeamId("");
      setSelectedTeamDetail(null);
    } finally {
      setMatchDataLoading(false);
    }
  };

  useEffect(() => {
    verifyBackendHealth();
    loadDatasets();
  }, []);

  useEffect(() => {
    if (!selectedDatasetId) return;
    setTeamSearchQuery(String(teamSearchByDataset[selectedDatasetId] || ""));
    const preferredTeamId = String(selectedTeamByDataset[selectedDatasetId] || selectedTeamId || "");
    loadTeamList(selectedDatasetId, preferredTeamId);
  }, [selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    setTeamSearchByDataset((prev) => (prev[selectedDatasetId] === teamSearchQuery ? prev : { ...prev, [selectedDatasetId]: teamSearchQuery }));
  }, [selectedDatasetId, teamSearchQuery]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    setSelectedTeamByDataset((prev) => (prev[selectedDatasetId] === selectedTeamId ? prev : { ...prev, [selectedDatasetId]: selectedTeamId }));
  }, [selectedDatasetId, selectedTeamId]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    const numericColumns = Array.isArray(dataMeta.numericColumns) ? dataMeta.numericColumns : [];
    setMetricSelectionsByDataset((prev) => {
      const current = Array.isArray(prev[selectedDatasetId]) ? prev[selectedDatasetId] : [];
      const next = current.filter((col) => numericColumns.includes(col));
      if (next.length === current.length) return prev;
      return { ...prev, [selectedDatasetId]: next };
    });
  }, [selectedDatasetId, dataMeta.numericColumns]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!selectedTeamId || !selectedDatasetId) {
        setSelectedTeamDetail(null);
        return;
      }
      setMatchDataLoading(true);
      setMatchDataError("");
      try {
        const res = await fetchMatchTeamById(selectedTeamId, selectedDatasetId);
        setSelectedTeamDetail(res.team || null);
      } catch (err: any) {
        setMatchDataError(`球队详情读取失败：${err.message}`);
        setSelectedTeamDetail(null);
      } finally {
        setMatchDataLoading(false);
      }
    };
    loadDetail();
  }, [selectedTeamId, selectedDatasetId, detailReloadTick]);

  const onMatchExcelUploadClick = () => excelInputRef.current?.click();

  const onMatchExcelChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMatchDataImporting(true);
    setMatchDataMessage("");
    setMatchDataError("");
    try {
      const backendReady = await verifyBackendHealth();
      if (!backendReady) {
        throw new Error("后端未就绪：请先启动 player-web/server/app.py 并确认 /api/health 可访问");
      }
      const res = await importMatchExcel(file);
      setMatchDataMessage(`导入成功：${res.teamCount} 支球队，${res.numericColumnCount} 个数值列`);
      const nextDatasetId = await loadDatasets(String(res.datasetId || ""));
      await loadTeamList(nextDatasetId, "");
    } catch (err: any) {
      setMatchDataError(`导入失败：${err.message}`);
    } finally {
      setMatchDataImporting(false);
      event.target.value = "";
    }
  };

  const handleDeleteCurrentDataset = async () => {
    if (!selectedDatasetId) return;
    if (!window.confirm("确认删除当前导入数据集吗？删除后不可恢复。")) return;
    setMatchDataError("");
    setMatchDataMessage("");
    try {
      const res = await deleteMatchDataset(selectedDatasetId);
      const next = String(res.selectedDatasetId || "");
      await loadDatasets(next);
      await loadTeamList(next, "");
      setMatchDataMessage("已删除当前数据集。");
    } catch (err: any) {
      setMatchDataError(`删除数据集失败：${err.message}`);
    }
  };

  const handleToggleMetricColumn = (column: string) => {
    if (!selectedDatasetId || !dataMeta.numericColumns.includes(column)) return;
    setMetricSelectionsByDataset((prev) => {
      const current = Array.isArray(prev[selectedDatasetId]) ? prev[selectedDatasetId] : [];
      const next = current.includes(column) ? current.filter((item) => item !== column) : [...current, column];
      return { ...prev, [selectedDatasetId]: next };
    });
  };

  const handleSelectAllMetricColumns = () => {
    if (!selectedDatasetId) return;
    setMetricSelectionsByDataset((prev) => ({ ...prev, [selectedDatasetId]: dataMeta.numericColumns }));
  };

  const handleClearMetricColumns = () => {
    if (!selectedDatasetId) return;
    setMetricSelectionsByDataset((prev) => ({ ...prev, [selectedDatasetId]: [] }));
  };

  const handleImportSelectedMetricsToMatchRadar = () => {
    if (!selectedTeamDetail || !Array.isArray(selectedTeamDetail.columns) || selectedTeamDetail.columns.length === 0) {
      setMatchDataError("请先选择球队并等待详情加载完成。");
      return;
    }
    if (selectedMetricColumns.length === 0) {
      setMatchDataError("请先勾选至少一个指标列。");
      return;
    }
    const detailMap = new Map(selectedTeamDetail.columns.map((item: any) => [String(item.column || ""), item]));
    const importedRows = selectedMetricColumns
      .map((column: string, index: number) => {
        const detail = detailMap.get(column);
        if (!detail) return null;
        const percentile = Number(detail.percentile);
        if (!Number.isFinite(percentile)) return null;
        const value = Math.max(0, Math.min(100, Number(percentile.toFixed(2))));
        const metric = String(getMatchProjectZhByColumn(column) || column).replace(/每90分钟/g, "").replace(/\s*per\s*90/gi, "").trim();
        const mappedGroup = getMatchProjectGroupByColumn(column);
        const fallback = inferMetricGroupAndOrder(column, metric);
        const group = normalizeImportedGroupName(mappedGroup || fallback.group);
        return {
          metric,
          value,
          group,
          order: 0,
          subOrder: 1,
          per90: String(detail.value ?? ""),
          tier: computeTier(value),
          color: "",
          _index: index
        };
      })
      .filter(Boolean) as any[];

    if (importedRows.length === 0) {
      setMatchDataError("当前勾选列没有可用百分比数据。");
      return;
    }
    const groupOrderMap = buildImportedGroupOrderMap(importedRows);
    const rows = importedRows
      .map((row: any) => ({ ...row, order: groupOrderMap.get(row.group) || 99 }))
      .sort((a: any, b: any) => Number(a.order) - Number(b.order) || Number(a._index) - Number(b._index))
      .map((row: any, idx: number) => ({ ...row, subOrder: idx + 1 }));

    const payload = {
      importedAt: new Date().toISOString(),
      datasetId: selectedDatasetId,
      team: selectedTeamDetail?.team || selectedTeamName || "",
      rows
    };
    writeLocalStore(STORAGE_KEYS.matchRadarImportPayload, payload);
    window.dispatchEvent(new Event("match-radar-imported"));
    setMatchDataMessage(`已导入 ${rows.length} 项到比赛雷达图。`);
    setMatchDataError("");
  };

  const backendOnline = backendHealth === "online";

  return (
    <section className="info-page">
      <div className="info-card player-data-layout">
        <div className="player-data-left">
          <h1>球队数据</h1>
          <p>导入 Excel（.xlsx）后写入比赛总结独立数据域，仅用于比赛雷达图。</p>
          <p>{`当前数据集球队数：${dataMeta.teamCount || 0}`}</p>
          <p>{`最近更新时间：${formatDateTime(dataMeta.updatedAt) || "-"}`}</p>
          <div className="title-row">
            <label>导入数据集</label>
            <select value={selectedDatasetId} onChange={(e) => setSelectedDatasetId(e.target.value)} disabled={datasetOptions.length === 0}>
              {datasetOptions.length === 0 ? <option value="">暂无已导入数据集</option> : null}
              {datasetOptions.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="btn-row">
            <button onClick={onMatchExcelUploadClick} disabled={matchDataImporting || !backendOnline}>
              {matchDataImporting ? "导入中..." : backendOnline ? "导入 Excel（需 Team 列）" : "后端未连接"}
            </button>
            <button onClick={handleDeleteCurrentDataset} disabled={!selectedDatasetId || matchDataImporting}>
              删除当前数据集
            </button>
            <input ref={excelInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden-file" onChange={onMatchExcelChange} />
          </div>
          <div className="title-row">
            <label>搜索球队</label>
            <input placeholder="输入球队名关键字" value={teamSearchQuery} onChange={(e) => setTeamSearchQuery(e.target.value)} disabled={teamOptions.length === 0} />
          </div>
          <div className="title-row">
            <label>选择球队</label>
            <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)} disabled={filteredTeamOptions.length === 0}>
              {teamOptions.length === 0 ? <option value="">暂无球队数据</option> : null}
              {teamOptions.length > 0 && filteredTeamOptions.length === 0 ? <option value="">无匹配球队</option> : null}
              {filteredTeamOptions.map((item: any) => (
                <option key={item.id} value={String(item.id)}>
                  {item.team}
                </option>
              ))}
            </select>
          </div>
          {!backendOnline ? <p className="msg err">导入已禁用：后端未连接（默认 http://127.0.0.1:8787）</p> : null}
          {matchDataMessage ? <p className="msg ok">{matchDataMessage}</p> : null}
          {matchDataError ? <p className="msg err">{matchDataError}</p> : null}
        </div>
        <div className="player-data-right">
          <p className="selected-player-title">{`当前球队：${selectedTeamName || "-"}`}</p>
          <div className="player-export-section player-export-inline">
            <p className="meta-title">勾选指标并导入到比赛雷达图</p>
            <p>{`已勾选：${selectedMetricColumns.length}/${dataMeta.numericColumns.length || 0}`}</p>
            <div className="btn-row">
              <button onClick={handleSelectAllMetricColumns} disabled={!selectedDatasetId || dataMeta.numericColumns.length === 0}>
                全选指标
              </button>
              <button onClick={handleClearMetricColumns} disabled={!selectedDatasetId || dataMeta.numericColumns.length === 0}>
                清空勾选
              </button>
              <button onClick={handleImportSelectedMetricsToMatchRadar} disabled={matchDataLoading || !selectedTeamId || selectedMetricColumns.length === 0}>
                一键导入到比赛雷达图
              </button>
            </div>
          </div>
          <div className="player-data-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>勾选</th>
                  <th>列标题</th>
                  <th>group</th>
                  <th>数值</th>
                  <th>排名</th>
                  <th>百分比 (%)</th>
                </tr>
              </thead>
              <tbody>
                {matchDataLoading ? (
                  <tr>
                    <td colSpan={6}>加载中...</td>
                  </tr>
                ) : null}
                {!matchDataLoading && selectedTeamDetail?.columns?.length
                  ? selectedTeamDetail.columns
                      .filter((row: any) => String(row.column || "").toLowerCase() !== "team")
                      .map((row: any) => (
                        <tr key={row.column}>
                          <td>
                            <input type="checkbox" checked={selectedMetricColumns.includes(row.column)} onChange={() => handleToggleMetricColumn(row.column)} disabled={!selectedDatasetId} />
                          </td>
                          <td>{formatColumnLabel(row.column)}</td>
                          <td>{getMatchProjectGroupByColumn(row.column) || "-"}</td>
                          <td>{String(row.value ?? "")}</td>
                          <td>{row.rank ?? "-"}</td>
                          <td>{row.percentile === null || row.percentile === undefined ? "-" : Number(row.percentile).toFixed(2)}</td>
                        </tr>
                      ))
                  : null}
                {!matchDataLoading && (!selectedTeamDetail || !selectedTeamDetail.columns || selectedTeamDetail.columns.length === 0) ? (
                  <tr>
                    <td colSpan={6}>暂无球队数据，请先导入 Excel（需包含 Team 列）。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MatchTeamDataPage;
