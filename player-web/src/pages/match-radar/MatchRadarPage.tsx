import React, { useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "../../app/constants";
import { readLocalStore, writeLocalStore } from "../../utils/localStore";
import { getTeamMappingRows, getTeamMappingRowsByName, normalizeTeamName } from "../../utils/teamMappingStore";

const WIDTH = 1120;
const HEIGHT = 900;
const CENTER_X = WIDTH / 2;
const CENTER_Y = 535;
const MAX_RADIUS = 300;

const DEFAULT_CONFIG = {
  datasetId: "",
  homeTeamId: "",
  awayTeamId: "",
  homeTeamName: "主队",
  awayTeamName: "客队",
  title: "比赛雷达图",
  subtitle: "数据来源：比赛总结 / 球队数据",
  homeScore: "2",
  awayScore: "0",
  homeColor: "#2f7fc4",
  awayColor: "#c62828",
  homeColorAutoLocked: "0",
  awayColorAutoLocked: "0",
  titleFontSize: "34",
  scoreFontSize: "76",
  teamNameFontSize: "24",
  pointRadius: "4",
  chartBackgroundColor: "#f8f5ef",
  homeLogoKey: "auto",
  awayLogoKey: "auto"
};

const GROUP_SORT_ORDER: Record<string, number> = {
  "进攻": 0,
  "其他": 1,
  "传球": 2,
  "对抗": 3,
  "防守": 4,
  "定位球": 5
};

type RadarImportRow = {
  column: string;
  metric: string;
  group: string;
  sourceIndex: number;
  homeRaw: string;
  awayRaw: string;
};

function pointAt(radius: number, angle: number) {
  return {
    x: CENTER_X + radius * Math.cos(angle),
    y: CENTER_Y + radius * Math.sin(angle)
  };
}

function polygonPath(points: Array<{ x: number; y: number }>) {
  if (!Array.isArray(points) || points.length === 0) return "";
  return `${points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")} Z`;
}

function colorToAlpha(hex: string, alpha = 0.22) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeHexColor(value: unknown) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : "";
}

function isColorAutoLocked(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  return text === "1" || text === "true";
}

function normalizeMatchDateText(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return raw;
}

function clampTitleFontSize(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 34;
  return Math.max(20, Math.min(64, num));
}

function clampPointRadius(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 4;
  return Math.max(2, Math.min(10, num));
}

function clampScoreFontSize(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 76;
  return Math.max(36, Math.min(120, num));
}

function clampMetricPositionShift(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(-20, Math.min(20, Math.round(num)));
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildLogoOptionKey(row: any, index: number) {
  const en = normalizeTeamName(row?.en).toLowerCase();
  const zh = normalizeTeamName(row?.zh).toLowerCase();
  const name = en || zh || String(index);
  return `${name}__${index}`;
}

function parseNumericValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").replace(/%/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function isInverseMetric(metric: unknown) {
  return String(metric || "").trim().toLowerCase() === "ppda";
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function getRadarRatio(value: number, maxValue: number, inverse = false) {
  const base = maxValue > 0 ? clampRatio(value / maxValue) : 0;
  return inverse ? 1 - base : base;
}

function normalizeGroupName(group: string) {
  const text = String(group || "").trim().toLowerCase();
  if (!text) return "其他";
  if (["other", "others", "其他"].includes(text)) return "其他";
  if (["attack", "attacking", "进攻"].includes(text)) return "进攻";
  if (["defense", "defence", "defending", "防守"].includes(text)) return "防守";
  if (["duel", "duels", "对抗"].includes(text)) return "对抗";
  if (["pass", "passing", "传球"].includes(text)) return "传球";
  if (["set piece", "set pieces", "定位球", "定位球进攻"].includes(text)) return "定位球";
  return String(group || "").trim() || "其他";
}

function getGroupSortOrder(group: string) {
  const key = normalizeGroupName(group);
  return Object.prototype.hasOwnProperty.call(GROUP_SORT_ORDER, key) ? GROUP_SORT_ORDER[key] : 99;
}

function clampTeamNameFontSize(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 24;
  return Math.max(14, Math.min(44, num));
}

function renderLogoBlock({
  side,
  logoSrc,
  teamName,
  teamColor,
  teamNameFontSize
}: {
  side: "home" | "away";
  logoSrc: string;
  teamName: string;
  teamColor: string;
  teamNameFontSize: number;
}) {
  const isHome = side === "home";
  const centerX = isHome ? 300 : WIDTH - 300;
  const badgeY = 96;
  const nameY = badgeY + 92;

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
      <text x={centerX} y={nameY} textAnchor="middle" fontSize={teamNameFontSize} fontWeight="700" fill={teamColor}>
        {teamName || (isHome ? "主队" : "客队")}
      </text>
    </g>
  );
}

function MatchRadarPage({ mappingRevision = 0, latestImportPayload = null }) {
  const [config, setConfig] = useState(() => {
    const saved = readLocalStore(STORAGE_KEYS.matchRadarCompareConfig, null);
    return { ...DEFAULT_CONFIG, ...(saved && typeof saved === "object" ? saved : {}) };
  });
  const [rows, setRows] = useState<RadarImportRow[]>([]);
  const [metricMaxByDataset, setMetricMaxByDataset] = useState(() => readLocalStore(STORAGE_KEYS.matchRadarMetricMaxByDataset, {}));
  const [metricPositionShiftByDataset, setMetricPositionShiftByDataset] = useState(() => readLocalStore(STORAGE_KEYS.matchRadarMetricPositionShiftByDataset, {}));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.matchRadarCompareConfig, config);
  }, [config]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.matchRadarMetricMaxByDataset, metricMaxByDataset);
  }, [metricMaxByDataset]);

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.matchRadarMetricPositionShiftByDataset, metricPositionShiftByDataset);
  }, [metricPositionShiftByDataset]);

  const updateConfig = (patch: any) => {
    setConfig((prev: any) => ({ ...prev, ...patch }));
  };

  const applyImportPayload = (incomingPayload?: any) => {
    const payload = incomingPayload && typeof incomingPayload === "object"
      ? incomingPayload
      : readLocalStore(STORAGE_KEYS.matchRadarImportPayload, null);
    if (!payload || !Array.isArray(payload.rows)) {
      setRows([]);
      return;
    }
    const parsedRows = payload.rows
      .map((row: any) => ({
        column: String(row?.column || "").trim(),
        metric: String(row?.metric || row?.column || "").trim(),
        group: normalizeGroupName(String(row?.group || "其他").trim()),
        sourceIndex: Number(row?.sourceIndex ?? 9999),
        homeRaw: String(row?.homeRaw ?? "").trim(),
        awayRaw: String(row?.awayRaw ?? "").trim()
      }))
      .filter((row: RadarImportRow) => row.column && row.metric)
      .sort((a: RadarImportRow, b: RadarImportRow) => {
        const groupDelta = getGroupSortOrder(a.group) - getGroupSortOrder(b.group);
        if (groupDelta !== 0) return groupDelta;
        const sourceDelta = Number(a.sourceIndex) - Number(b.sourceIndex);
        if (sourceDelta !== 0) return sourceDelta;
        return String(a.metric).localeCompare(String(b.metric), "zh-CN");
      });

    if (parsedRows.length === 0) {
      setRows([]);
      setError("未读取到可用指标，请先在球队数据页选择主客队并勾选指标导入。");
      return;
    }

    setRows(parsedRows);
    setConfig((prev: any) => {
      const nextHomeTeamName = String(payload.homeTeamName || prev.homeTeamName || "主队");
      const nextAwayTeamName = String(payload.awayTeamName || prev.awayTeamName || "客队");
      const nextMatchDateText = normalizeMatchDateText(payload.matchDateText);
      const homeKey = normalizeTeamName(nextHomeTeamName).toLowerCase();
      const awayKey = normalizeTeamName(nextAwayTeamName).toLowerCase();
      const mappedHomeColor = normalizeHexColor(homeKey ? autoLogoMap.get(homeKey)?.color : "");
      const mappedAwayColor = normalizeHexColor(awayKey ? autoLogoMap.get(awayKey)?.color : "");
      const homeLocked = isColorAutoLocked(prev.homeColorAutoLocked);
      const awayLocked = isColorAutoLocked(prev.awayColorAutoLocked);
      const nextHomeScore = String(payload.homeScore || "").trim();
      const nextAwayScore = String(payload.awayScore || "").trim();
      return {
        ...prev,
        datasetId: String(payload.datasetId || prev.datasetId || ""),
        homeTeamId: String(payload.homeTeamId || prev.homeTeamId || ""),
        awayTeamId: String(payload.awayTeamId || prev.awayTeamId || ""),
        homeTeamName: nextHomeTeamName,
        awayTeamName: nextAwayTeamName,
        homeColor: !homeLocked && mappedHomeColor ? mappedHomeColor : String(prev.homeColor || DEFAULT_CONFIG.homeColor),
        awayColor: !awayLocked && mappedAwayColor ? mappedAwayColor : String(prev.awayColor || DEFAULT_CONFIG.awayColor),
        homeColorAutoLocked: homeLocked ? "1" : "0",
        awayColorAutoLocked: awayLocked ? "1" : "0",
        homeScore: nextHomeScore && nextAwayScore ? nextHomeScore : String(prev.homeScore || DEFAULT_CONFIG.homeScore),
        awayScore: nextHomeScore && nextAwayScore ? nextAwayScore : String(prev.awayScore || DEFAULT_CONFIG.awayScore),
        subtitle: nextMatchDateText || "数据来源：比赛总结 / 球队数据"
      };
    });
    setError("");
    setMessage(`已读取导入数据：${parsedRows.length} 项指标`);
  };

  useEffect(() => {
    applyImportPayload();
    const handler = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      applyImportPayload(detail);
    };
    window.addEventListener("match-radar-imported", handler as EventListener);
    return () => window.removeEventListener("match-radar-imported", handler as EventListener);
  }, [mappingRevision]);

  useEffect(() => {
    if (!latestImportPayload || !Array.isArray(latestImportPayload.rows)) return;
    applyImportPayload(latestImportPayload);
  }, [latestImportPayload]);

  const logoOptions = useMemo(() => {
    const list = getTeamMappingRows();
    return list
      .map((row, index) => ({
        key: buildLogoOptionKey(row, index),
        label: String(row.zh || row.en || `Logo ${index + 1}`).trim(),
        logoDataUrl: String(row.logoDataUrl || "").trim()
      }))
      .filter((item) => item.logoDataUrl);
  }, [mappingRevision]);

  const autoLogoMap = useMemo(() => getTeamMappingRowsByName(), [mappingRevision]);

  const pickLogoSrc = (teamName: string, logoKey: string) => {
    if (logoKey && logoKey !== "auto") {
      return String(logoOptions.find((item) => item.key === logoKey)?.logoDataUrl || "");
    }
    const key = normalizeTeamName(teamName).toLowerCase();
    return String(autoLogoMap.get(key)?.logoDataUrl || "");
  };

  const homeLogoSrc = pickLogoSrc(config.homeTeamName, config.homeLogoKey);
  const awayLogoSrc = pickLogoSrc(config.awayTeamName, config.awayLogoKey);
  const teamNameFontSize = clampTeamNameFontSize(config.teamNameFontSize);
  const titleFontSize = clampTitleFontSize(config.titleFontSize);
  const scoreFontSize = clampScoreFontSize(config.scoreFontSize);
  const scoreDashFontSize = Math.max(30, Math.round(scoreFontSize * 0.92));
  const pointRadius = clampPointRadius(config.pointRadius);
  const chartBackgroundColor = normalizeHexColor(config.chartBackgroundColor) || "#f8f5ef";

  const datasetMaxMap = useMemo(() => {
    const ds = String(config.datasetId || "");
    const map = metricMaxByDataset && typeof metricMaxByDataset === "object" ? metricMaxByDataset[ds] : null;
    return map && typeof map === "object" ? map : {};
  }, [metricMaxByDataset, config.datasetId]);

  const datasetMetricShiftMap = useMemo(() => {
    const ds = String(config.datasetId || "");
    const map = metricPositionShiftByDataset && typeof metricPositionShiftByDataset === "object" ? metricPositionShiftByDataset[ds] : null;
    return map && typeof map === "object" ? map : {};
  }, [metricPositionShiftByDataset, config.datasetId]);

  const enrichedRows = useMemo(() => {
    return rows.map((row) => {
      const homeValue = parseNumericValue(row.homeRaw) ?? 0;
      const awayValue = parseNumericValue(row.awayRaw) ?? 0;
      const manualMax = Number(datasetMaxMap[row.column]);
      const autoMax = Math.max(Math.abs(homeValue), Math.abs(awayValue)) * 1.1;
      const resolvedMax = Number.isFinite(manualMax) && manualMax > 0 ? manualMax : autoMax > 0 ? autoMax : 1;
      return {
        ...row,
        homeValue,
        awayValue,
        maxValue: resolvedMax,
        manualMax: Number.isFinite(manualMax) && manualMax > 0 ? manualMax : null
      };
    });
  }, [rows, datasetMaxMap]);

  const positionedRows = useMemo(() => {
    return enrichedRows
      .map((row, idx) => {
        const shift = clampMetricPositionShift(datasetMetricShiftMap[row.column]);
        return {
          ...row,
          baseIndex: idx,
          positionShift: shift,
          positionOrder: idx + shift
        };
      })
      .sort((a, b) => {
        const orderDelta = Number(a.positionOrder) - Number(b.positionOrder);
        if (orderDelta !== 0) return orderDelta;
        return Number(a.baseIndex) - Number(b.baseIndex);
      });
  }, [enrichedRows, datasetMetricShiftMap]);

  const handleMetricMaxChange = (column: string, value: string) => {
    const ds = String(config.datasetId || "");
    if (!ds) return;
    const parsed = Number(value);
    setMetricMaxByDataset((prev: any) => {
      const base = prev && typeof prev === "object" ? prev : {};
      const current = base[ds] && typeof base[ds] === "object" ? { ...base[ds] } : {};
      if (!value.trim() || !Number.isFinite(parsed) || parsed <= 0) {
        delete current[column];
      } else {
        current[column] = parsed;
      }
      return { ...base, [ds]: current };
    });
  };

  const handleMetricPositionShiftChange = (column: string, value: string) => {
    const ds = String(config.datasetId || "");
    if (!ds) return;
    const nextShift = clampMetricPositionShift(value);
    setMetricPositionShiftByDataset((prev: any) => {
      const base = prev && typeof prev === "object" ? prev : {};
      const current = base[ds] && typeof base[ds] === "object" ? { ...base[ds] } : {};
      if (nextShift === 0) {
        delete current[column];
      } else {
        current[column] = nextShift;
      }
      return { ...base, [ds]: current };
    });
  };

  useEffect(() => {
    const ds = String(config.datasetId || "");
    if (!ds) return;
    const availableColumns = new Set(rows.map((row) => row.column));
    setMetricPositionShiftByDataset((prev: any) => {
      const base = prev && typeof prev === "object" ? prev : {};
      const current = base[ds] && typeof base[ds] === "object" ? base[ds] : {};
      const next: Record<string, number> = {};
      let changed = false;
      Object.keys(current).forEach((column) => {
        if (availableColumns.has(column)) {
          next[column] = clampMetricPositionShift(current[column]);
        } else {
          changed = true;
        }
      });
      if (!changed && Object.keys(next).length === Object.keys(current).length) return prev;
      return { ...base, [ds]: next };
    });
  }, [rows, config.datasetId]);

  const axisPoints = useMemo(() => {
    const total = positionedRows.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return positionedRows.map((_, i) => pointAt(MAX_RADIUS, start + i * step));
  }, [positionedRows]);

  const homePoints = useMemo(() => {
    const total = positionedRows.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return positionedRows.map((row, i) => {
      const ratio = getRadarRatio(row.homeValue, row.maxValue, isInverseMetric(row.metric));
      return pointAt(ratio * MAX_RADIUS, start + i * step);
    });
  }, [positionedRows]);

  const awayPoints = useMemo(() => {
    const total = positionedRows.length || 1;
    const step = (Math.PI * 2) / total;
    const start = -Math.PI / 2;
    return positionedRows.map((row, i) => {
      const ratio = getRadarRatio(row.awayValue, row.maxValue, isInverseMetric(row.metric));
      return pointAt(ratio * MAX_RADIUS, start + i * step);
    });
  }, [positionedRows]);

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
      ctx.fillStyle = chartBackgroundColor;
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

  return (
    <section className="info-page">
      <div className="info-card match-radar-card">
        <div className="match-radar-left">
          <h1>比赛雷达图</h1>
          <p>仅使用“比赛总结 / 球队数据”导入的主客队原始值，不使用排名和百分比。</p>

          <div className="match-score-color-row">
            <div className="title-row">
              <label>主队颜色</label>
              <input
                className="square-color-picker"
                type="color"
                value={config.homeColor}
                onChange={(e) => updateConfig({ homeColor: e.target.value, homeColorAutoLocked: "1" })}
              />
            </div>
            <div className="title-row">
              <label>主队比分</label>
              <input className="match-score-input" value={config.homeScore} onChange={(e) => updateConfig({ homeScore: e.target.value })} />
            </div>
            <div className="title-row">
              <label>客队比分</label>
              <input className="match-score-input" value={config.awayScore} onChange={(e) => updateConfig({ awayScore: e.target.value })} />
            </div>
            <div className="title-row">
              <label>客队颜色</label>
              <input
                className="square-color-picker"
                type="color"
                value={config.awayColor}
                onChange={(e) => updateConfig({ awayColor: e.target.value, awayColorAutoLocked: "1" })}
              />
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

          <div className="match-radar-grid-2">
            <div className="title-row">
              <label>队名字号（14-44）</label>
              <div className="match-size-control">
                <input
                  type="range"
                  min="14"
                  max="44"
                  step="1"
                  value={teamNameFontSize}
                  onChange={(e) => updateConfig({ teamNameFontSize: e.target.value })}
                />
                <input
                  type="number"
                  min="14"
                  max="44"
                  step="1"
                  value={teamNameFontSize}
                  onChange={(e) => updateConfig({ teamNameFontSize: e.target.value })}
                />
              </div>
            </div>
            <div className="title-row">
              <label>主标题字号（20-64）</label>
              <div className="match-size-control">
                <input
                  type="range"
                  min="20"
                  max="64"
                  step="1"
                  value={titleFontSize}
                  onChange={(e) => updateConfig({ titleFontSize: e.target.value })}
                />
                <input
                  type="number"
                  min="20"
                  max="64"
                  step="1"
                  value={titleFontSize}
                  onChange={(e) => updateConfig({ titleFontSize: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="match-radar-grid-2">
            <div className="title-row">
              <label>比分字号（36-120）</label>
              <div className="match-size-control">
                <input
                  type="range"
                  min="36"
                  max="120"
                  step="1"
                  value={scoreFontSize}
                  onChange={(e) => updateConfig({ scoreFontSize: e.target.value })}
                />
                <input
                  type="number"
                  min="36"
                  max="120"
                  step="1"
                  value={scoreFontSize}
                  onChange={(e) => updateConfig({ scoreFontSize: e.target.value })}
                />
              </div>
            </div>
            <div className="title-row">
              <label>点大小（2-10）</label>
              <div className="match-size-control">
                <input
                  type="range"
                  min="2"
                  max="10"
                  step="1"
                  value={pointRadius}
                  onChange={(e) => updateConfig({ pointRadius: e.target.value })}
                />
                <input
                  type="number"
                  min="2"
                  max="10"
                  step="1"
                  value={pointRadius}
                  onChange={(e) => updateConfig({ pointRadius: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="match-radar-grid-2">
            <div className="title-row">
              <label>主标题</label>
              <input value={config.title} onChange={(e) => updateConfig({ title: e.target.value })} />
            </div>
            <div className="title-row">
              <label>副标题</label>
              <input value={config.subtitle} onChange={(e) => updateConfig({ subtitle: e.target.value })} />
            </div>
          </div>

          <div className="match-export-row">
            <div className="title-row match-bg-control">
              <label>右图背景色</label>
              <input
                className="square-color-picker"
                type="color"
                value={chartBackgroundColor}
                onChange={(e) => updateConfig({ chartBackgroundColor: e.target.value })}
              />
            </div>
            <button onClick={exportSvg} disabled={enrichedRows.length === 0}>
              导出 SVG
            </button>
            <button onClick={exportPng} disabled={enrichedRows.length === 0}>
              导出 PNG
            </button>
          </div>

          {message ? <p className="msg ok">{message}</p> : null}
          {error ? <p className="msg err">{error}</p> : null}

          <div className="player-data-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>位置</th>
                  <th>指标</th>
                  <th>分组</th>
                  <th>{config.homeTeamName || "主队"}</th>
                  <th>{config.awayTeamName || "客队"}</th>
                  <th>max（min固定0）</th>
                </tr>
              </thead>
              <tbody>
                {positionedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>暂无数据，请先到“比赛总结 / 球队数据”选择主客队并勾选指标导入。</td>
                  </tr>
                ) : null}
                {positionedRows.map((row) => (
                  <tr key={row.column}>
                    <td>
                      <input
                        className="match-position-input"
                        type="number"
                        min="-20"
                        max="20"
                        step="1"
                        value={clampMetricPositionShift(row.positionShift)}
                        onChange={(e) => handleMetricPositionShiftChange(row.column, e.target.value)}
                      />
                    </td>
                    <td>{row.metric}</td>
                    <td>{row.group}</td>
                    <td>{row.homeRaw || "-"}</td>
                    <td>{row.awayRaw || "-"}</td>
                    <td>
                      <input
                        className="match-max-input"
                        type="number"
                        min="0"
                        step="any"
                        value={row.manualMax === null ? "" : String(row.manualMax)}
                        placeholder={String(Number(row.maxValue.toFixed(4)))}
                        onChange={(e) => handleMetricMaxChange(row.column, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="match-position-help">
            位置说明：0 = 不移动；1 = 往后挪1位；2 = 往后挪2位；-1 = 往前挪1位；-2 = 往前挪2位。PPDA 指标在雷达图中采用反向映射（数值越小越靠外，数值越大越靠内），仅影响右图点位显示，不改变表格原始值。
          </p>
        </div>

        <div className="match-radar-right">
          <svg id="match-radar-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
            <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill={chartBackgroundColor} />

            <text x={CENTER_X} y="42" textAnchor="middle" fontSize={titleFontSize} fontWeight="700" fill="#2f2a24">
              {config.title}
            </text>
            <text x={CENTER_X} y="74" textAnchor="middle" fontSize="16" fill="#5f5850">
              {config.subtitle}
            </text>

            {renderLogoBlock({ side: "home", logoSrc: homeLogoSrc, teamName: config.homeTeamName, teamColor: config.homeColor, teamNameFontSize })}
            {renderLogoBlock({ side: "away", logoSrc: awayLogoSrc, teamName: config.awayTeamName, teamColor: config.awayColor, teamNameFontSize })}

            <text x={CENTER_X - 24} y="152" textAnchor="end" fontSize={scoreFontSize} fontWeight="700" fill={config.homeColor}>
              {config.homeScore || "0"}
            </text>
            <text x={CENTER_X} y="152" textAnchor="middle" fontSize={scoreDashFontSize} fontWeight="700" fill="#2f2a24">
              -
            </text>
            <text x={CENTER_X + 24} y="152" textAnchor="start" fontSize={scoreFontSize} fontWeight="700" fill={config.awayColor}>
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
              <circle key={`away-${idx}`} cx={pt.x} cy={pt.y} r={pointRadius} fill={config.awayColor} />
            ))}
            {homePoints.map((pt, idx) => (
              <circle key={`home-${idx}`} cx={pt.x} cy={pt.y} r={pointRadius} fill={config.homeColor} />
            ))}

            {axisPoints.map((_, idx) => {
              const row = positionedRows[idx];
              if (!row) return null;
              const labelPt = pointAt(MAX_RADIUS + 36, -Math.PI / 2 + ((Math.PI * 2) / positionedRows.length) * idx);
              return (
                <g key={`label-${idx}`}>
                  <text x={labelPt.x} y={labelPt.y} textAnchor="middle" fontSize="22" fontWeight="700" fill="#342f29">
                    {row.metric}
                  </text>
                  <text x={labelPt.x} y={labelPt.y + 24} textAnchor="middle" fontSize="18" fontWeight="700">
                    <tspan fill={config.homeColor}>{row.homeRaw || "-"}</tspan>
                    <tspan fill="#2f2a24">/</tspan>
                    <tspan fill={config.awayColor}>{row.awayRaw || "-"}</tspan>
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}

export default MatchRadarPage;
