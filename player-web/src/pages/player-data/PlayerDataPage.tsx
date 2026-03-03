import React from "react";
import { getProjectGroupByColumn } from "../../utils/projectMappingStore";

function PlayerDataPage(props) {
  const {
    playerDataMeta,
    formatDateTime,
    selectedDatasetId,
    setSelectedDatasetId,
    datasetOptions,
    onPlayerExcelUploadClick,
    playerDataImporting,
    backendHealth,
    handleDeleteCurrentDataset,
    playerExcelInputRef,
    onPlayerExcelChange,
    playerSearchQuery,
    setPlayerSearchQuery,
    playerOptions,
    selectedPlayerId,
    setSelectedPlayerId,
    filteredPlayerOptions,
    playerDataMessage,
    playerDataError,
    selectedPlayerName,
    selectedMetricColumns,
    handleSelectAllMetricColumns,
    handleClearMetricColumns,
    handleImportSelectedMetricsToRadar,
    playerDataLoading,
    playerDataMetaNumericColumns,
    selectedPlayerDetail,
    handleToggleMetricColumn,
    formatPlayerDataColumnLabel
  } = props;
  const backendOnline = backendHealth === "online";

  return (
    <section className="info-page">
      <div className="info-card player-data-layout">
        <div className="player-data-left">
          <h1>球员数据</h1>
          <p>导入 Excel（.xlsx）后写入本地后端，可通过下拉切换球员并查看每列排名与百分比。</p>
          <p>{`当前数据集球员数：${playerDataMeta.playerCount || 0}`}</p>
          <p>{`最近更新时间：${formatDateTime(playerDataMeta.updatedAt) || "-"}`}</p>
          <div className="title-row">
            <label>导入数据集</label>
            <select value={selectedDatasetId} onChange={(e) => setSelectedDatasetId(e.target.value)} disabled={datasetOptions.length === 0}>
              {datasetOptions.length === 0 ? <option value="">暂无已导入数据集</option> : null}
              {datasetOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="btn-row">
            <button onClick={onPlayerExcelUploadClick} disabled={playerDataImporting || !backendOnline}>
              {playerDataImporting ? "导入中..." : backendOnline ? "导入 Excel" : "后端未连接"}
            </button>
            <button onClick={handleDeleteCurrentDataset} disabled={!selectedDatasetId || playerDataImporting}>
              删除当前数据集
            </button>
            <input
              ref={playerExcelInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden-file"
              onChange={onPlayerExcelChange}
            />
          </div>
          <div className="title-row">
            <label>搜索球员</label>
            <input
              placeholder="输入球员名关键字"
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
              disabled={playerOptions.length === 0}
            />
          </div>
          <div className="title-row">
            <label>选择球员</label>
            <select value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)} disabled={filteredPlayerOptions.length === 0}>
              {playerOptions.length === 0 ? <option value="">暂无球员数据</option> : null}
              {playerOptions.length > 0 && filteredPlayerOptions.length === 0 ? <option value="">无匹配球员</option> : null}
              {filteredPlayerOptions.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.player}
                </option>
              ))}
            </select>
          </div>
          {!backendOnline ? <p className="msg err">导入已禁用：后端未连接（默认 http://127.0.0.1:8787）</p> : null}
          {playerDataMessage ? <p className="msg ok">{playerDataMessage}</p> : null}
          {playerDataError ? <p className="msg err">{playerDataError}</p> : null}
        </div>
        <div className="player-data-right">
          <p className="selected-player-title">{`当前球员：${selectedPlayerName || "-"}`}</p>
          <div className="player-export-section player-export-inline">
            <p className="meta-title">在下方同一张表里勾选指标并导出到雷达图生成器</p>
            <p>{`已勾选：${selectedMetricColumns.length}/${playerDataMetaNumericColumns.length || 0}`}</p>
            <div className="btn-row">
              <button onClick={handleSelectAllMetricColumns} disabled={!selectedDatasetId || playerDataMetaNumericColumns.length === 0}>
                全选指标
              </button>
              <button onClick={handleClearMetricColumns} disabled={!selectedDatasetId || playerDataMetaNumericColumns.length === 0}>
                清空勾选
              </button>
              <button
                onClick={handleImportSelectedMetricsToRadar}
                disabled={playerDataLoading || !selectedPlayerId || selectedMetricColumns.length === 0}
              >
                一键导入到雷达图生成器
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
                {playerDataLoading ? (
                  <tr>
                    <td colSpan="6">加载中...</td>
                  </tr>
                ) : null}
                {!playerDataLoading && selectedPlayerDetail?.columns?.length
                  ? selectedPlayerDetail.columns
                      .filter((row) => String(row.column || "").toLowerCase() !== "player")
                      .map((row) => (
                        <tr key={row.column}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedMetricColumns.includes(row.column)}
                              onChange={() => handleToggleMetricColumn(row.column)}
                              disabled={!selectedDatasetId}
                            />
                          </td>
                          <td>{formatPlayerDataColumnLabel(row.column)}</td>
                          <td>{getProjectGroupByColumn(row.column) || "-"}</td>
                          <td>{String(row.value ?? "")}</td>
                          <td>{row.rank ?? "-"}</td>
                          <td>{row.percentile === null || row.percentile === undefined ? "-" : Number(row.percentile).toFixed(2)}</td>
                        </tr>
                      ))
                  : null}
                {!playerDataLoading && (!selectedPlayerDetail || !selectedPlayerDetail.columns || selectedPlayerDetail.columns.length === 0) ? (
                  <tr>
                    <td colSpan="6">暂无球员数据，请先导入 Excel。</td>
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

export default PlayerDataPage;
