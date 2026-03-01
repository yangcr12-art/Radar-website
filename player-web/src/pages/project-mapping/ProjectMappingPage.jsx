import React, { useMemo, useState } from "react";
import { getProjectMappingRows, saveProjectGroupByColumn } from "../../utils/projectMappingStore";

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv() {
  const header = "English,中文翻译,group";
  const body = getProjectMappingRows().map((item) => {
    const en = String(item.en || "").replace(/"/g, '""');
    const zh = String(item.zh || "").replace(/"/g, '""');
    const group = String(item.group || "").replace(/"/g, '""');
    return `"${en}","${zh}","${group}"`;
  }).join("\n");
  return `${header}\n${body}\n`;
}

function ProjectMappingPage() {
  const [groupByColumn, setGroupByColumn] = useState(() => {
    const rows = getProjectMappingRows();
    return Object.fromEntries(rows.map((item) => [String(item.en || "").trim(), String(item.group || "")]));
  });

  const rows = useMemo(
    () =>
      getProjectMappingRows().map((item) => ({
        ...item,
        group: String(groupByColumn[item.en] || "")
      })),
    [groupByColumn]
  );

  const handleGroupChange = (en, value) => {
    const key = String(en || "").trim();
    setGroupByColumn((prev) => {
      const next = { ...prev, [key]: value };
      saveProjectGroupByColumn(next);
      return next;
    });
  };

  const handleDownloadCsv = () => {
    downloadFile("project_mapping_columns.csv", toCsv(), "text/csv;charset=utf-8");
  };

  return (
    <section className="info-page">
      <div className="info-card mapping-card">
        <h1>项目对应表</h1>
        <p>来源：`Search results (2).xlsx` 首行英文列名。下表为中英对应。</p>
        <div className="mapping-actions">
          <button onClick={handleDownloadCsv}>下载对应表 CSV</button>
        </div>
        <div className="mapping-table-wrap">
          <table className="mapping-table">
            <thead>
              <tr>
                <th>#</th>
                <th>English</th>
                <th>中文翻译</th>
                <th>group</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => (
                <tr key={`${item.en}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{item.en}</td>
                  <td>{item.zh}</td>
                  <td>
                    <input
                      value={item.group}
                      onChange={(e) => handleGroupChange(item.en, e.target.value)}
                      placeholder="例如：传球 / 对抗 / 防守"
                    />
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
