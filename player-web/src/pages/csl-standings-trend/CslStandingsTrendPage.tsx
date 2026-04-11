import React, { useEffect, useMemo, useRef, useState } from "react";
import { checkHealth, deleteCslStandingsDataset, fetchCslStandingsDataset, fetchCslStandingsDatasets, importCslStandingsExcel } from "../../api/storageClient";
import { STORAGE_KEYS } from "../../app/constants";
import { readLocalStore, writeLocalStore } from "../../utils/localStore";
import { formatDateTime } from "../../utils/timeFormat";

const METRIC_OPTIONS = [
  { key: "points", label: "原积分" },
  { key: "pointsNet", label: "净积分" },
  { key: "rank", label: "原排名" },
  { key: "rankNet", label: "净排名" },
  { key: "goalsFor", label: "进球" },
  { key: "goalsAgainst", label: "丢球" }
] as const;

const TEAM_COLORS = [
  "#1f77b4",
  "#d62728",
  "#2ca02c",
  "#ff7f0e",
  "#9467bd",
  "#17becf",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#006d77",
  "#c1121f",
  "#4361ee",
  "#2b9348",
  "#f9844a",
  "#6a4c93",
  "#0a9396",
  "#9b2226"
];

function numeric(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  return points.map((p, index) => `${index === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

function getMetricStep(metric: string) {
  if (metric === "rank" || metric === "rankNet") return 2;
  return 5;
}

function isRankMetric(metric: string) {
  return metric === "rank" || metric === "rankNet";
}

function CslTrendChart({
  metric,
  metricLabel,
  rounds,
  selectedTeams,
  seriesByTeam,
  colorByTeam
}: {
  metric: string;
  metricLabel: string;
  rounds: number[];
  selectedTeams: string[];
  seriesByTeam: Record<string, any[]>;
  colorByTeam: Record<string, string>;
}) {
  const width = 760;
  const height = 340;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 56;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const [hoveredRound, setHoveredRound] = useState<number | null>(null);
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);
  const [focusTeam, setFocusTeam] = useState<string | null>(null);

  const hasRound = rounds.length > 0;
  const xMin = hasRound ? rounds[0] : 0;
  const xMax = hasRound ? rounds[rounds.length - 1] : 1;
  const xDen = Math.max(1, xMax - xMin);

  const metricValues = selectedTeams
    .flatMap((team) => (Array.isArray(seriesByTeam[team]) ? seriesByTeam[team] : []))
    .map((item) => numeric(item?.[metric], 0));
  const step = getMetricStep(metric);
  const rankMetric = isRankMetric(metric);

  const yMin = rankMetric ? 1 : 0;
  let yMax = rankMetric ? Math.max(1, ...metricValues, selectedTeams.length, 1) : Math.max(1, ...metricValues, 1);
  if (rankMetric) {
    yMax = Math.max(1, Math.ceil(yMax / step) * step);
  } else {
    yMax = Math.max(step, Math.ceil(yMax / step) * step);
  }
  const yDen = Math.max(1, yMax - yMin);

  const yAt = (value: number) => {
    if (rankMetric) {
      const ratio = (value - yMin) / yDen;
      return padT + ratio * plotH;
    }
    const ratio = (value - yMin) / yDen;
    return padT + (1 - ratio) * plotH;
  };

  const xAt = (round: number) => {
    const ratio = (round - xMin) / xDen;
    return padL + ratio * plotW;
  };

  const yTicks = useMemo(() => {
    const ticks = [] as number[];
    if (rankMetric) {
      let cursor = 1;
      while (cursor <= yMax) {
        ticks.push(cursor);
        cursor += step;
      }
      if (ticks[ticks.length - 1] !== yMax) ticks.push(yMax);
      return ticks;
    }
    let cursor = 0;
    while (cursor <= yMax) {
      ticks.push(cursor);
      cursor += step;
    }
    if (ticks[ticks.length - 1] !== yMax) ticks.push(yMax);
    return ticks;
  }, [rankMetric, step, yMax]);
  const hasFocusTeam = Boolean(focusTeam && selectedTeams.includes(String(focusTeam)));

  const pointByTeamAndRound = useMemo(() => {
    const map = new Map<string, any>();
    selectedTeams.forEach((team) => {
      const series = Array.isArray(seriesByTeam[team]) ? seriesByTeam[team] : [];
      series.forEach((item) => {
        const round = numeric(item?.round, 0);
        if (round <= 0) return;
        map.set(`${team}::${round}`, item);
      });
    });
    return map;
  }, [selectedTeams, seriesByTeam]);

  const tooltipPayload = useMemo(() => {
    if (!hasRound) return "";
    if (hoveredTeam && hoveredRound !== null) {
      const item = pointByTeamAndRound.get(`${hoveredTeam}::${hoveredRound}`);
      const value = item ? numeric(item?.[metric], 0) : null;
      if (value !== null) return `R${hoveredRound} | ${hoveredTeam} | ${metricLabel}：${value}`;
    }
    if (hoveredRound !== null) {
      if (!hasFocusTeam) return `R${hoveredRound} | 请先悬浮任意球队点位以锁定焦点球队`;
      const team = String(focusTeam);
      const item = pointByTeamAndRound.get(`${team}::${hoveredRound}`);
      const value = item ? numeric(item?.[metric], 0) : null;
      if (value !== null) return `R${hoveredRound} | ${team} | ${metricLabel}：${value}`;
      return `R${hoveredRound} | ${team} | ${metricLabel}：-`;
    }
    return "";
  }, [focusTeam, hasFocusTeam, hasRound, hoveredRound, hoveredTeam, metric, metricLabel, pointByTeamAndRound]);

  const activeRound = hoveredRound;
  const activeTeam = hoveredTeam || (activeRound !== null && hasFocusTeam ? String(focusTeam) : "");
  const activeSeriesRow = activeRound !== null && activeTeam ? pointByTeamAndRound.get(`${activeTeam}::${activeRound}`) : null;
  const activeValue = activeSeriesRow ? numeric(activeSeriesRow?.[metric], NaN) : NaN;

  return (
    <div className="csl-trend-card">
      <div className="csl-trend-head">
        <h3>{metricLabel}走势</h3>
        {tooltipPayload ? <span className="csl-tooltip-inline">{tooltipPayload}</span> : null}
      </div>
      {!hasRound || selectedTeams.length === 0 ? (
        <p className="fitness-empty">暂无可展示走势数据。</p>
      ) : (
        <svg
          className="csl-trend-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${metricLabel}走势`}
          onMouseLeave={() => {
            setHoveredRound(null);
            setHoveredTeam(null);
          }}
        >
          <rect x={0} y={0} width={width} height={height} fill="#fffdf8" />
          {[0, 0.5, 1].map((ratio) => {
            const y = padT + ratio * plotH;
            return <line key={`grid-${ratio}`} x1={padL} x2={padL + plotW} y1={y} y2={y} stroke="#e5dac9" strokeDasharray="4 4" />;
          })}

          {activeRound !== null ? (
            <line
              className="csl-hover-guide-line"
              x1={xAt(activeRound)}
              x2={xAt(activeRound)}
              y1={padT}
              y2={padT + plotH}
            />
          ) : null}
          {activeRound !== null && Number.isFinite(activeValue) ? (
            <line
              className="csl-hover-guide-line"
              x1={padL}
              x2={padL + plotW}
              y1={yAt(activeValue)}
              y2={yAt(activeValue)}
            />
          ) : null}

          <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#8d7f6f" />
          <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#8d7f6f" />

          {yTicks.map((tick) => {
            const y = yAt(tick);
            return (
              <text key={`yt-${tick}`} x={padL - 8} y={y + 4} textAnchor="end" className="csl-axis-text">
                {tick}
              </text>
            );
          })}

          {rounds.map((round) => {
            const x = xAt(round);
            const isActiveRound = activeRound === round;
            return (
              <g key={`xt-${round}`}>
                <circle cx={x} cy={padT + plotH} r={2.1} fill={isActiveRound ? "#7a201d" : "#8d7f6f"} />
                <text
                  x={x}
                  y={padT + plotH + 16}
                  textAnchor="end"
                  transform={`rotate(45 ${x} ${padT + plotH + 16})`}
                  className={`csl-axis-text csl-axis-text-x${isActiveRound ? " active" : ""}`}
                  onMouseEnter={() => setHoveredRound(round)}
                  onMouseLeave={() => setHoveredRound(null)}
                >
                  R{round}
                </text>
              </g>
            );
          })}

          {selectedTeams.map((team) => {
            const series = Array.isArray(seriesByTeam[team]) ? seriesByTeam[team] : [];
            const points = series
              .map((item) => ({
                round: numeric(item?.round, 0),
                value: numeric(item?.[metric], rankMetric ? yMax : 0),
                x: xAt(numeric(item?.round, 0)),
                y: yAt(numeric(item?.[metric], rankMetric ? yMax : 0))
              }))
              .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y) && item.round > 0);
            const path = buildPath(points.map((p) => ({ x: p.x, y: p.y })));
            if (!path) return null;
            const teamActive = activeTeam === team;
            return (
              <g key={`${metric}-${team}`}>
                <path d={path} fill="none" stroke={colorByTeam[team] || "#111"} strokeWidth={teamActive ? 3 : 2} opacity={teamActive || !activeTeam ? 1 : 0.68} />
                {points.map((p, idx) => {
                  const pointActive = teamActive && activeRound === p.round;
                  return (
                    <g key={`${metric}-${team}-${idx}`}>
                      <circle cx={p.x} cy={p.y} r={pointActive ? 4.2 : 2.4} fill={colorByTeam[team] || "#111"} />
                      <circle
                        className="csl-point-hitbox"
                        cx={p.x}
                        cy={p.y}
                        r={8}
                        fill="transparent"
                        onMouseEnter={() => {
                          setFocusTeam(team);
                          setHoveredTeam(team);
                          setHoveredRound(p.round);
                        }}
                        onMouseLeave={() => {
                          setHoveredTeam(null);
                          setHoveredRound(null);
                        }}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function CslStandingsTrendPage() {
  const defaultMetrics = ["points", "pointsNet", "rank", "rankNet", "goalsFor", "goalsAgainst"];
  const [backendHealth, setBackendHealth] = useState("checking");
  const [datasetOptions, setDatasetOptions] = useState([] as any[]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(() => String(readLocalStore(STORAGE_KEYS.cslStandingsSelectedDatasetId, "") || ""));
  const [selectedSeason, setSelectedSeason] = useState(() => String(readLocalStore(STORAGE_KEYS.cslStandingsSelectedSeason, "") || ""));
  const [selectedTeamsByDataset, setSelectedTeamsByDataset] = useState(() => readLocalStore(STORAGE_KEYS.cslStandingsSelectedTeamsByDataset, {}));
  const [selectedMetrics, setSelectedMetrics] = useState(() => {
    const raw = readLocalStore(STORAGE_KEYS.cslStandingsSelectedMetrics, defaultMetrics);
    if (!Array.isArray(raw)) return defaultMetrics;
    const validSet = new Set(METRIC_OPTIONS.map((item) => item.key));
    const normalized = raw.filter((item) => validSet.has(String(item)));
    return normalized.length > 0 ? normalized : defaultMetrics;
  });
  const [selectedRoundByDataset, setSelectedRoundByDataset] = useState(() => readLocalStore(STORAGE_KEYS.cslStandingsSelectedRoundByDataset, {}));
  const [datasetDoc, setDatasetDoc] = useState(null as any);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const backendOnline = backendHealth === "online";

  const seasons = Array.isArray(datasetDoc?.seasons) ? datasetDoc.seasons.map((item: any) => String(item)) : [];
  const rounds = Array.isArray(datasetDoc?.rounds) ? datasetDoc.rounds.map((item: any) => numeric(item, 0)).filter((item: number) => item > 0) : [];
  const teams = Array.isArray(datasetDoc?.teams) ? datasetDoc.teams.map((item: any) => String(item)).filter(Boolean) : [];

  const selectedTeams = useMemo(() => {
    if (!selectedDatasetId) return [] as string[];
    const raw = Array.isArray(selectedTeamsByDataset[selectedDatasetId]) ? selectedTeamsByDataset[selectedDatasetId].map((item: any) => String(item)) : [];
    const valid = raw.filter((team: string) => teams.includes(team));
    if (valid.length > 0) return valid;
    return teams;
  }, [selectedDatasetId, selectedTeamsByDataset, teams]);

  const selectedRound = useMemo(() => {
    if (!selectedDatasetId) return 0;
    const current = numeric(selectedRoundByDataset[selectedDatasetId], 0);
    if (current > 0 && rounds.includes(current)) return current;
    return rounds.length > 0 ? rounds[rounds.length - 1] : 0;
  }, [selectedDatasetId, selectedRoundByDataset, rounds]);

  const standingsRows = useMemo(() => {
    const snapshots = Array.isArray(datasetDoc?.standingsByRound) ? datasetDoc.standingsByRound : [];
    const found = snapshots.find((item: any) => numeric(item?.round, 0) === selectedRound);
    return Array.isArray(found?.rows) ? found.rows : [];
  }, [datasetDoc, selectedRound]);

  const seriesByTeam = useMemo(() => {
    const map = datasetDoc?.trendSeriesByTeam;
    return map && typeof map === "object" ? map : {};
  }, [datasetDoc]);

  const colorByTeam = useMemo(() => {
    const out: Record<string, string> = {};
    teams.forEach((team, idx) => {
      out[team] = TEAM_COLORS[idx % TEAM_COLORS.length];
    });
    return out;
  }, [teams]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.cslStandingsSelectedDatasetId, selectedDatasetId);
  }, [selectedDatasetId]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.cslStandingsSelectedSeason, selectedSeason);
  }, [selectedSeason]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.cslStandingsSelectedTeamsByDataset, selectedTeamsByDataset);
  }, [selectedTeamsByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.cslStandingsSelectedMetrics, selectedMetrics);
  }, [selectedMetrics]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.cslStandingsSelectedRoundByDataset, selectedRoundByDataset);
  }, [selectedRoundByDataset]);

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
      const res = await fetchCslStandingsDatasets();
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

  const loadDatasetDetail = async (datasetId: string, season: string) => {
    if (!datasetId) {
      setDatasetDoc(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchCslStandingsDataset(datasetId, season);
      const data = res.data || null;
      setDatasetDoc(data);
      const seasonFromData = String(data?.selectedSeason || "");
      if (seasonFromData && seasonFromData !== selectedSeason) {
        setSelectedSeason(seasonFromData);
      }
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
    loadDatasetDetail(selectedDatasetId, selectedSeason);
  }, [selectedDatasetId, selectedSeason]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    if (teams.length === 0) return;
    const prev = Array.isArray(selectedTeamsByDataset[selectedDatasetId]) ? selectedTeamsByDataset[selectedDatasetId].map((item: any) => String(item)) : [];
    const next = prev.filter((team: string) => teams.includes(team));
    if (next.length > 0 && next.length === prev.length) return;
    setSelectedTeamsByDataset((old: any) => ({ ...old, [selectedDatasetId]: next.length > 0 ? next : teams }));
  }, [selectedDatasetId, teams, selectedTeamsByDataset]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    if (rounds.length === 0) return;
    const current = numeric(selectedRoundByDataset[selectedDatasetId], 0);
    if (current > 0 && rounds.includes(current)) return;
    setSelectedRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: rounds[rounds.length - 1] }));
  }, [selectedDatasetId, rounds, selectedRoundByDataset]);

  const onUploadClick = () => fileInputRef.current?.click();

  const onExcelChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage("");
    setError("");
    try {
      const backendReady = await verifyBackendHealth();
      if (!backendReady) throw new Error("后端未就绪：请先启动 player-web/server/app.py 并确认 /api/health 可访问");
      const res = await importCslStandingsExcel(file);
      setMessage(`导入成功：${res.matchCount || 0} 场，${res.teamCount || 0} 队，赛季 ${Array.isArray(res.seasons) ? res.seasons.join(", ") : "-"}`);
      const nextDatasetId = await loadDatasets(String(res.datasetId || ""));
      await loadDatasetDetail(nextDatasetId, "");
    } catch (err: any) {
      setError(`导入失败：${err.message}`);
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const handleDeleteDataset = async () => {
    if (!selectedDatasetId) return;
    if (!window.confirm("确认删除当前积分数据集吗？删除后不可恢复。")) return;
    setMessage("");
    setError("");
    try {
      const res = await deleteCslStandingsDataset(selectedDatasetId);
      const nextId = String(res.selectedDatasetId || "");
      const loadedId = await loadDatasets(nextId);
      await loadDatasetDetail(loadedId, "");
      setMessage("已删除当前积分数据集。");
    } catch (err: any) {
      setError(`删除失败：${err.message}`);
    }
  };

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev: string[]) => {
      if (prev.includes(metric)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== metric);
      }
      return [...prev, metric];
    });
  };

  const toggleTeam = (team: string) => {
    if (!selectedDatasetId) return;
    setSelectedTeamsByDataset((prev: any) => {
      const current = Array.isArray(prev[selectedDatasetId]) ? prev[selectedDatasetId].map((item: any) => String(item)) : teams;
      const exists = current.includes(team);
      const next = exists ? current.filter((item: string) => item !== team) : [...current, team];
      return {
        ...prev,
        [selectedDatasetId]: next.length > 0 ? next : current
      };
    });
  };

  return (
    <section className="info-page">
      <div className="info-card fitness-page-shell csl-standings-page-shell">
        <h1>中超积分走势</h1>
        <p>导入赛程 Excel 后，按“比赛结束”自动累计积分、排名、进球、丢球，支持多队同图趋势分析。</p>

        <div className="csl-top-bar">
          <select className="fitness-top-control" value={selectedDatasetId} onChange={(e) => setSelectedDatasetId(e.target.value)} disabled={datasetOptions.length === 0}>
            {datasetOptions.length === 0 ? <option value="">暂无已导入数据集</option> : null}
            {datasetOptions.map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <select className="fitness-top-control" value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)} disabled={seasons.length === 0}>
            {seasons.length === 0 ? <option value="">暂无赛季</option> : null}
            {seasons.map((season: string) => (
              <option key={season} value={season}>
                {season}赛季
              </option>
            ))}
          </select>

          <button className="fitness-top-control" onClick={onUploadClick} disabled={importing || !backendOnline}>
            {importing ? "导入中..." : backendOnline ? "导入赛程Excel" : "后端未连接"}
          </button>

          <button className="fitness-top-control" onClick={handleDeleteDataset} disabled={!selectedDatasetId || importing}>
            删除当前数据集
          </button>

          <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden-file" onChange={onExcelChange} />
        </div>

        <div className="fitness-meta-row">
          <p>{`联赛：中超`}</p>
          <p>{`赛季：${selectedSeason || "-"}`}</p>
          <p>{`球队数：${teams.length}`}</p>
          <p>{`轮次：${rounds.length > 0 ? `1-${rounds[rounds.length - 1]}` : "-"}`}</p>
          <p>{`更新时间：${formatDateTime(datasetDoc?.updatedAt) || "-"}`}</p>
        </div>

        {!backendOnline ? <p className="msg err">导入已禁用：后端未连接（默认 http://127.0.0.1:8787）</p> : null}
        {loading ? <p className="fitness-empty">数据加载中...</p> : null}
        {message ? <p className="msg ok">{message}</p> : null}
        {error ? <p className="msg err">{error}</p> : null}

        <div className="csl-control-grid">
          <div className="fitness-card">
            <h2>指标</h2>
            <div className="csl-check-grid">
              {METRIC_OPTIONS.map((item) => (
                <label key={item.key} className="csl-check-item">
                  <input type="checkbox" checked={selectedMetrics.includes(item.key)} onChange={() => toggleMetric(item.key)} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="fitness-card">
            <h2>球队（默认全选）</h2>
            <div className="csl-team-check-grid">
              {teams.map((team) => (
                <label key={team} className="csl-check-item">
                  <input type="checkbox" checked={selectedTeams.includes(team)} onChange={() => toggleTeam(team)} />
                  <span className="csl-team-label" title={team}>
                    <i style={{ background: colorByTeam[team] || "#111" }} />
                    {team}
                  </span>
                </label>
              ))}
              {teams.length === 0 ? <p className="fitness-empty">暂无球队数据。</p> : null}
            </div>
          </div>
        </div>

        <div className="csl-layout">
          <div className="fitness-left-col">
            <div className="fitness-card">
              <div className="csl-table-head">
                <h2>每轮积分榜</h2>
                <select
                  className="fitness-top-control csl-round-select"
                  value={selectedRound > 0 ? selectedRound : ""}
                  onChange={(e) => {
                    const value = numeric(e.target.value, 0);
                    if (!selectedDatasetId || value <= 0) return;
                    setSelectedRoundByDataset((prev: any) => ({ ...prev, [selectedDatasetId]: value }));
                  }}
                  disabled={rounds.length === 0}
                >
                  {rounds.length === 0 ? <option value="">暂无轮次</option> : null}
                  {rounds.map((round) => (
                    <option key={round} value={round}>
                      第{round}轮
                    </option>
                  ))}
                </select>
              </div>
              <div className="player-data-table-wrap fitness-table-wrap csl-table-wrap">
                <table className="player-data-table csl-table">
                  <thead>
                    <tr>
                      <th>净排名</th>
                      <th>原排名</th>
                      <th>球队</th>
                      <th>扣分</th>
                      <th>净积分</th>
                      <th>原积分</th>
                      <th>进球</th>
                      <th>丢球</th>
                      <th>净胜球</th>
                      <th>场次</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standingsRows.map((row: any) => (
                      <tr key={String(row.team)}>
                        <td>{numeric(row.rankNet, 0) || "-"}</td>
                        <td>{numeric(row.rankRaw, numeric(row.rank, 0)) || "-"}</td>
                        <td>{String(row.team || "")}</td>
                        <td>{numeric(row.deduction, 0)}</td>
                        <td>{numeric(row.pointsNet, numeric(row.points, 0))}</td>
                        <td>{numeric(row.pointsRaw, numeric(row.points, 0))}</td>
                        <td>{numeric(row.goalsFor, 0)}</td>
                        <td>{numeric(row.goalsAgainst, 0)}</td>
                        <td>{numeric(row.goalDiff, 0)}</td>
                        <td>{numeric(row.played, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {standingsRows.length === 0 ? <p className="fitness-empty">暂无积分榜数据。</p> : null}
              </div>
            </div>
          </div>

          <div className="fitness-right-col csl-trend-col">
            {METRIC_OPTIONS.filter((item) => selectedMetrics.includes(item.key)).map((item) => (
              <CslTrendChart
                key={item.key}
                metric={item.key}
                metricLabel={item.label}
                rounds={rounds}
                selectedTeams={selectedTeams}
                seriesByTeam={seriesByTeam}
                colorByTeam={colorByTeam}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default CslStandingsTrendPage;
