import React, { useEffect, useMemo, useState } from "react";
import { fetchMatchDatasets, fetchMatchTeamById, fetchMatchTeamList } from "../../api/storageClient";
import { STORAGE_KEYS } from "../../app/constants";
import { readLocalStore, writeLocalStore } from "../../utils/localStore";
import { getMatchProjectGroupByColumn, getMatchProjectZhByColumn } from "../../utils/matchProjectMappingStore";
import { getTeamMappingRows, getTeamMappingRowsByName, normalizeTeamName } from "../../utils/teamMappingStore";

const WIDTH = 1120;
const HEIGHT = 900;
const CENTER_X = WIDTH / 2;
const CENTER_Y = 520;
const MAX_RADIUS = 300;

const DEFAULT_CONFIG = {
  datasetId: "",
  homeTeamId: "",
  awayTeamId: "",
  title: "比赛雷达图",
  subtitle: "数据来源：比赛总结 / 球队数据",
  homeScore: "2",
  awayScore: "0",
  homeColor: "#2f7fc4",
  awayColor: "#c62828",
  homeLogoKey: "auto",
  awayLogoKey: "auto"
};

function pointAt(radius, angle) {
  return {
    x: CENTER_X + radius * Math.cos(angle),
    y: CENTER_Y + radius * Math.sin(angle)
  };
}

function polygonPath(points) {
  if (!Array.isArray(points) || points.length === 0) return "";
  return `${points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")} Z`;
}

function colorToAlpha(hex, alpha = 0.22) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

function buildLogoOptionKey(row, index) {
  const en = normalizeTeamName(row?.en).toLowerCase();
  const zh = normalizeTeamName(row?.zh).toLowerCase();
  const name = en || zh || String(index);
  return `${name}__${index}`;
}

function getMetricLabel(column) {
  return String(getMatchProjectZhByColumn(column) || column || "").trim();
}

function getMetricGroup(column) {
  return String(getMatchProjectGroupByColumn(column) || "其他").trim() || "其他";
}

function buildNumericMetricMap(teamDetail) {
  const map = new Map();
  const columns = Array.isArray(teamDetail?.columns) ? teamDetail.columns : [];
  columns.forEach((item) => {
    const column = String(item?.column || "").trim();
    if (!column || !item?.isNumeric) return;
    const percentile = Number(item?.percentile);
    if (!Number.isFinite(percentile)) return;
    map.set(column, {
      column,
      label: getMetricLabel(column),
      group: getMetricGroup(column),
      percentile: Math.max(0, Math.min(100, percentile)),
      raw: String(item?.value ?? "")
    });
  });
  return map;
}

function renderLogoBlock({ side, logoSrc, teamName, teamColor }) {
  const isHome = side === "home";
  const centerX = isHome ? 120 : WIDTH - 120;
  const nameY = 292;
  const badgeY = 120;

  return (
    <g>
      {logoSrc ? (
        <image x={centerX - 62} y={badgeY - 62} width="124" height="124" href={logoSrc} preserveAspectRatio="xMidYMid meet" />
      ) : (
        <g>
          <circle cx={centerX} cy={badgeY} r="58" fill="#f6efe3" stroke="#d2c6b6" strokeWidth="2" />
          <text x={centerX} y={badgeY + 6} textAnchor="middle" fontSize="34" fontWeight="700" fill={teamColor}>
            {String(teamName || "?").slice(0, 1).toUpperCase()}
          </text>
        </g>
      )}
      <text x={centerX} y={nameY} textAnchor="middle" fontSize="24" fontWeight="700" fill={teamColor}>
        {teamName || (isHome ? "主队" : "客队")}
      </text>
    </g>
  );
}

function MatchRadarPage() {
  const [config, setConfig] = useState(() => {
    const saved = readLocalStore(STORAGE_KEYS.matchRadarCompareConfig, null);
    return { ...DEFAULT_CONFIG, ...(saved && typeof saved === "object" ? saved : {}) };
  });
  const [datasetOptions, setDatasetOptions] = useState([] as any[]);
  const [teamOptions, setTeamOptions] = useState([] as any[]);
  const [homeTeamDetail, setHomeTeamDetail] = useState(null as any);
  const [awayTeamDetail, setAwayTeamDetail] = useState(null as any);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.matchRadarCompareConfig, config);
  }, [config]);

  const updateConfig = (patch) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const loadDatasets = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchMatchDatasets();
      const datasets = Array.isArray(res?.datasets) ? res.datasets : [];
      setDatasetOptions(datasets);
      if (datasets.length === 0) {
        setTeamOptions([]);
        updateConfig({ datasetId: "", homeTeamId: "", awayTeamId: "" });
        return;
      }
      const exists = datasets.some((item) => item.id === config.datasetId);
      const datasetId = exists ? config.datasetId : String(res.selectedDatasetId || datasets[0]?.id || "");
      if (datasetId !== config.datasetId) updateConfig({ datasetId });
    } catch (err: any) {
      setError(`读取比赛数据集失败：${err.message}`);
      setDatasetOptions([]);
      setTeamOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamOptions = async (datasetId) => {
    if (!datasetId) {
      setTeamOptions([]);
      updateConfig({ homeTeamId: "", awayTeamId: "" });
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetchMatchTeamList(datasetId);
      const teams = Array.isArray(res?.teams) ? res.teams : [];
      setTeamOptions(teams);
      if (teams.length === 0) {
        updateConfig({ homeTeamId: "", awayTeamId: "" });
        return;
      }
      const hasHome = teams.some((item) => item.id === config.homeTeamId);
      const hasAway = teams.some((item) => item.id === config.awayTeamId);
      const nextHome = hasHome ? config.homeTeamId : String(teams[0]?.id || "");
      let nextAway = hasAway ? config.awayTeamId : String(teams[1]?.id || teams[0]?.id || "");
      if (nextAway === nextHome) {
        const other = teams.find((item) => item.id !== nextHome);
        nextAway = String(other?.id || nextAway);
      }
      updateConfig({ homeTeamId: nextHome, awayTeamId: nextAway });
    } catch (err: any) {
      setError(`读取球队列表失败：${err.message}`);
      setTeamOptions([]);
      updateConfig({ homeTeamId: "", awayTeamId: "" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatasets();
  }, []);

  useEffect(() => {
    loadTeamOptions(config.datasetId);
  }, [config.datasetId]);

  useEffect(() => {
    const loadTeamDetail = async (teamId, setDetail) => {
      if (!teamId || !config.datasetId) {
        setDetail(null);
        return;
      }
      try {
        const res = await fetchMatchTeamById(teamId, config.datasetId);
        setDetail(res?.team || null);
      } catch {
        setDetail(null);
      }
    };
    loadTeamDetail(config.homeTeamId, setHomeTeamDetail);
    loadTeamDetail(config.awayTeamId, setAwayTeamDetail);
  }, [config.datasetId, config.homeTeamId, config.awayTeamId]);

  const homeTeamName = useMemo(() => {
    if (homeTeamDetail?.team) return String(homeTeamDetail.team);
    return String(teamOptions.find((item) => item.id === config.homeTeamId)?.team || "");
  }, [homeTeamDetail, teamOptions, config.homeTeamId]);

  const awayTeamName = useMemo(() => {
    if (awayTeamDetail?.team) return String(awayTeamDetail.team);
    return String(teamOptions.find((item) => item.id === config.awayTeamId)?.team || "");
  }, [awayTeamDetail, teamOptions, config.awayTeamId]);

  const logoOptions = useMemo(() => {
    const rows = getTeamMappingRows();
    return rows
      .map((row, index) => ({
        key: buildLogoOptionKey(row, index),
        label: String(row.zh || row.en || `Logo ${index + 1}`).trim(),
        logoDataUrl: String(row.logoDataUrl || "").trim()
      }))
      .filter((item) => item.logoDataUrl);
  }, []);

  const autoLogoMap = useMemo(() => getTeamMappingRowsByName(), []);

  const pickLogoSrc = (teamName, logoKey) => {
    if (logoKey && logoKey !== "auto") {
      return String(logoOptions.find((item) => item.key === logoKey)?.logoDataUrl || "");
    }
    const key = normalizeTeamName(teamName).toLowerCase();
    return String(autoLogoMap.get(key)?.logoDataUrl || "");
  };

  const homeLogoSrc = pickLogoSrc(homeTeamName, config.homeLogoKey);
  const awayLogoSrc = pickLogoSrc(awayTeamName, config.awayLogoKey);

  const rows = useMemo(() => {
    const homeMap = buildNumericMetricMap(homeTeamDetail);
    const awayMap = buildNumericMetricMap(awayTeamDetail);
    const sharedColumns = [...homeMap.keys()].filter((key) => awayMap.has(key));
    return sharedColumns
      .map((column) => {
        const h = homeMap.get(column);
        const a = awayMap.get(column);
        return {
          column,
          metric: h?.label || column,
          group: h?.group || "其他",
          homePercentile: Number(h?.percentile || 0),
          awayPercentile: Number(a?.percentile || 0),
          homeRaw: String(h?.raw ?? ""),
          awayRaw: String(a?.raw ?? "")
        };
      })
      .sort((a, b) => {
        if (a.group !== b.group) return String(a.group).localeCompare(String(b.group), "zh-CN");
        return String(a.metric).localeCompare(String(b.metric), "zh-CN");
      });
  }, [homeTeamDetail, awayTeamDetail]);

  const axisPoints = useMemo(() => {
    const total = rows.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return rows.map((_, i) => pointAt(MAX_RADIUS, start + i * step));
  }, [rows]);

  const homePoints = useMemo(() => {
    const total = rows.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return rows.map((row, i) => pointAt((Math.max(0, Math.min(100, row.homePercentile)) / 100) * MAX_RADIUS, start + i * step));
  }, [rows]);

  const awayPoints = useMemo(() => {
    const total = rows.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return rows.map((row, i) => pointAt((Math.max(0, Math.min(100, row.awayPercentile)) / 100) * MAX_RADIUS, start + i * step));
  }, [rows]);

  const homePath = polygonPath(homePoints);
  const awayPath = polygonPath(awayPoints);

  const exportSvg = () => {
    const svg = document.getElementById("match-radar-svg");
    if (!svg) {
      setError("未找到雷达图 SVG。");
      return;
    }
    const text = new XMLSerializer().serializeToString(svg);
    downloadFile("match_radar.svg", text, "image/svg+xml;charset=utf-8");
    setMessage("已导出 SVG");
    setError("");
  };

  const exportPng = async () => {
    const svg = document.getElementById("match-radar-svg");
    if (!svg) {
      setError("未找到雷达图 SVG。");
      return;
    }
    const text = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("PNG 导出失败：无法创建画布。");
        URL.revokeObjectURL(url);
        return;
      }
      ctx.fillStyle = "#f8f5ef";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
      canvas.toBlob((out) => {
        if (!out) {
          setError("PNG 导出失败。");
          return;
        }
        const outUrl = URL.createObjectURL(out);
        const a = document.createElement("a");
        a.href = outUrl;
        a.download = "match_radar.png";
        a.click();
        URL.revokeObjectURL(outUrl);
      }, "image/png");
      URL.revokeObjectURL(url);
      setMessage("已导出 PNG");
      setError("");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("PNG 导出失败：图片渲染异常。");
    };
    img.src = url;
  };

  const handleHomeTeamChange = (teamId) => {
    if (!teamId) {
      updateConfig({ homeTeamId: "" });
      return;
    }
    let nextAway = config.awayTeamId;
    if (teamId === config.awayTeamId) {
      const other = teamOptions.find((item) => item.id !== teamId);
      nextAway = String(other?.id || "");
    }
    updateConfig({ homeTeamId: teamId, awayTeamId: nextAway });
  };

  const handleAwayTeamChange = (teamId) => {
    if (!teamId) {
      updateConfig({ awayTeamId: "" });
      return;
    }
    let nextHome = config.homeTeamId;
    if (teamId === config.homeTeamId) {
      const other = teamOptions.find((item) => item.id !== teamId);
      nextHome = String(other?.id || "");
    }
    updateConfig({ homeTeamId: nextHome, awayTeamId: teamId });
  };

  return (
    <section className="info-page">
      <div className="info-card match-radar-card">
        <div className="match-radar-left">
          <h1>比赛雷达图</h1>
          <p>在同一比赛数据集中选择主队/客队，生成双队对比雷达图。</p>

          <div className="title-row">
            <label>数据集</label>
            <select value={config.datasetId} onChange={(e) => updateConfig({ datasetId: e.target.value })}>
              {datasetOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="match-radar-grid-2">
            <div className="title-row">
              <label>主队</label>
              <select value={config.homeTeamId} onChange={(e) => handleHomeTeamChange(e.target.value)}>
                {teamOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.team}
                  </option>
                ))}
              </select>
            </div>
            <div className="title-row">
              <label>客队</label>
              <select value={config.awayTeamId} onChange={(e) => handleAwayTeamChange(e.target.value)}>
                {teamOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.team}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="match-radar-grid-2">
            <div className="title-row">
              <label>主队比分</label>
              <input value={config.homeScore} onChange={(e) => updateConfig({ homeScore: e.target.value })} />
            </div>
            <div className="title-row">
              <label>客队比分</label>
              <input value={config.awayScore} onChange={(e) => updateConfig({ awayScore: e.target.value })} />
            </div>
          </div>

          <div className="match-radar-grid-2">
            <div className="title-row">
              <label>主队颜色</label>
              <input type="color" value={config.homeColor} onChange={(e) => updateConfig({ homeColor: e.target.value })} />
            </div>
            <div className="title-row">
              <label>客队颜色</label>
              <input type="color" value={config.awayColor} onChange={(e) => updateConfig({ awayColor: e.target.value })} />
            </div>
          </div>

          <div className="match-radar-grid-2">
            <div className="title-row">
              <label>主队 Logo</label>
              <select value={config.homeLogoKey} onChange={(e) => updateConfig({ homeLogoKey: e.target.value })}>
                <option value="auto">自动（球队对应表）</option>
                {logoOptions.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="title-row">
              <label>客队 Logo</label>
              <select value={config.awayLogoKey} onChange={(e) => updateConfig({ awayLogoKey: e.target.value })}>
                <option value="auto">自动（球队对应表）</option>
                {logoOptions.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="title-row">
            <label>主标题</label>
            <input value={config.title} onChange={(e) => updateConfig({ title: e.target.value })} />
          </div>
          <div className="title-row">
            <label>副标题</label>
            <input value={config.subtitle} onChange={(e) => updateConfig({ subtitle: e.target.value })} />
          </div>

          <div className="btn-row">
            <button onClick={exportSvg} disabled={rows.length === 0}>
              导出 SVG
            </button>
            <button onClick={exportPng} disabled={rows.length === 0}>
              导出 PNG
            </button>
          </div>

          {loading ? <p className="msg">加载中...</p> : null}
          {message ? <p className="msg ok">{message}</p> : null}
          {error ? <p className="msg err">{error}</p> : null}

          <div className="player-data-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>指标</th>
                  <th>分组</th>
                  <th>{homeTeamName || "主队"}%</th>
                  <th>{awayTeamName || "客队"}%</th>
                  <th>{homeTeamName || "主队"}原始值</th>
                  <th>{awayTeamName || "客队"}原始值</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>暂无可对比指标。请确认主客队均已选且有共同数值列。</td>
                  </tr>
                ) : null}
                {rows.map((row, idx) => (
                  <tr key={`${row.metric}-${idx}`}>
                    <td>{row.metric}</td>
                    <td>{row.group}</td>
                    <td>{row.homePercentile.toFixed(2)}</td>
                    <td>{row.awayPercentile.toFixed(2)}</td>
                    <td>{row.homeRaw || "-"}</td>
                    <td>{row.awayRaw || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="match-radar-right">
          <svg id="match-radar-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
            <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="#f8f5ef" />

            <text x={CENTER_X} y="48" textAnchor="middle" fontSize="34" fontWeight="700" fill="#2f2a24">
              {config.title}
            </text>
            <text x={CENTER_X} y="82" textAnchor="middle" fontSize="16" fill="#5f5850">
              {config.subtitle}
            </text>

            {renderLogoBlock({ side: "home", logoSrc: homeLogoSrc, teamName: homeTeamName, teamColor: config.homeColor })}
            {renderLogoBlock({ side: "away", logoSrc: awayLogoSrc, teamName: awayTeamName, teamColor: config.awayColor })}

            <text x={CENTER_X - 24} y="162" textAnchor="end" fontSize="76" fontWeight="700" fill={config.homeColor}>
              {config.homeScore || "0"}
            </text>
            <text x={CENTER_X} y="162" textAnchor="middle" fontSize="70" fontWeight="700" fill="#2f2a24">
              -
            </text>
            <text x={CENTER_X + 24} y="162" textAnchor="start" fontSize="76" fontWeight="700" fill={config.awayColor}>
              {config.awayScore || "0"}
            </text>

            {[20, 40, 60, 80, 100].map((tick) => (
              <circle key={tick} cx={CENTER_X} cy={CENTER_Y} r={(tick / 100) * MAX_RADIUS} fill="none" stroke="#d9cfbf" strokeDasharray="4 6" />
            ))}

            {axisPoints.map((pt, idx) => (
              <line key={idx} x1={CENTER_X} y1={CENTER_Y} x2={pt.x} y2={pt.y} stroke="#c8bfb2" />
            ))}

            {awayPath ? <path d={awayPath} fill={colorToAlpha(config.awayColor, 0.2)} stroke={config.awayColor} strokeWidth="3" /> : null}
            {homePath ? <path d={homePath} fill={colorToAlpha(config.homeColor, 0.2)} stroke={config.homeColor} strokeWidth="3" /> : null}

            {awayPoints.map((pt, idx) => (
              <circle key={`away-${idx}`} cx={pt.x} cy={pt.y} r="4" fill={config.awayColor} />
            ))}
            {homePoints.map((pt, idx) => (
              <circle key={`home-${idx}`} cx={pt.x} cy={pt.y} r="4" fill={config.homeColor} />
            ))}

            {axisPoints.map((_, idx) => {
              const row = rows[idx];
              if (!row) return null;
              const labelPt = pointAt(MAX_RADIUS + 36, -Math.PI / 2 + ((Math.PI * 2) / rows.length) * idx);
              return (
                <text key={`label-${idx}`} x={labelPt.x} y={labelPt.y} textAnchor="middle" fontSize="22" fontWeight="700" fill="#342f29">
                  {row.metric}
                </text>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}

export default MatchRadarPage;
