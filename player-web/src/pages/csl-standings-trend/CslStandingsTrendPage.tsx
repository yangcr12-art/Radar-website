import React, { useEffect, useMemo, useRef, useState } from "react";
import { checkHealth, deleteCslStandingsDataset, fetchCslStandingsDataset, fetchCslStandingsDatasets, getApiBaseLabel, importCslStandingsExcel } from "../../api/storageClient";
import { STORAGE_KEYS } from "../../app/constants";
import { readLocalStore, writeLocalStore } from "../../utils/localStore";
import { getTeamMappingRowsByName, normalizeTeamName } from "../../utils/teamMappingStore";
import { formatDateTime } from "../../utils/timeFormat";
import { normalizeHexColor } from "../../utils/color";
import { numeric } from "../../utils/number";
import { normalizeTrendData } from "./utils/normalizeTrendData";

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

const PLAY_SPEED_MIN_MS = 200;
const PLAY_SPEED_MAX_MS = 2000;
const PLAY_SPEED_STEP_MS = 100;
const PLAY_SPEED_DEFAULT_MS = 800;
const POINT_OFFSET_STEP = 8;
const LOGO_OFFSET_STEP = 14;
const MAX_OFFSET_SPREAD = 42;

function clampPlaySpeedMs(value: unknown) {
  const raw = numeric(value, PLAY_SPEED_DEFAULT_MS);
  const stepped = Math.round(raw / PLAY_SPEED_STEP_MS) * PLAY_SPEED_STEP_MS;
  return Math.min(PLAY_SPEED_MAX_MS, Math.max(PLAY_SPEED_MIN_MS, stepped));
}

function easeInOutCubic(t: number) {
  const v = Math.min(1, Math.max(0, t));
  if (v < 0.5) return 4 * v * v * v;
  return 1 - Math.pow(-2 * v + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
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
  revealRound,
  playbackFromRound,
  playbackToRound,
  playbackProgress,
  isPlaying,
  rounds,
  selectedTeams,
  seriesByTeam,
  colorByTeam,
  logoByTeam,
  failedLogoByTeam,
  persistLogoRound,
  lockedTeam,
  onLogoError,
  onToggleLockedTeam,
  onClearLockedTeam
}: {
  metric: string;
  metricLabel: string;
  revealRound: number;
  playbackFromRound: number;
  playbackToRound: number;
  playbackProgress: number;
  isPlaying: boolean;
  rounds: number[];
  selectedTeams: string[];
  seriesByTeam: Record<string, any[]>;
  colorByTeam: Record<string, string>;
  logoByTeam: Record<string, string>;
  failedLogoByTeam: Record<string, boolean>;
  persistLogoRound: number;
  lockedTeam: string;
  onLogoError: (team: string) => void;
  onToggleLockedTeam: (team: string) => void;
  onClearLockedTeam: () => void;
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
  const [hoveredClusterKey, setHoveredClusterKey] = useState<string | null>(null);

  const hasRound = rounds.length > 0;
  const xMin = hasRound ? rounds[0] : 0;
  const xMax = hasRound ? rounds[rounds.length - 1] : 1;
  const xDen = Math.max(1, xMax - xMin);

  const metricValues = selectedTeams
    .flatMap((team) => (Array.isArray(seriesByTeam[team]) ? seriesByTeam[team] : []))
    .map((item) => numeric(item?.[metric], 0));
  const step = getMetricStep(metric);
  const rankMetric = isRankMetric(metric);
  const netPointsMetric = metric === "pointsNet";

  const yMin = rankMetric ? 1 : netPointsMetric ? -10 : 0;
  let yMax = rankMetric ? Math.max(1, ...metricValues, selectedTeams.length, 1) : Math.max(1, ...metricValues, 1);
  if (rankMetric) {
    yMax = Math.max(1, Math.ceil(yMax / step) * step);
  } else {
    if (netPointsMetric) {
      yMax = Math.max(0, yMax);
    }
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
    let cursor = yMin;
    while (cursor <= yMax) {
      ticks.push(cursor);
      cursor += step;
    }
    if (ticks[ticks.length - 1] !== yMax) ticks.push(yMax);
    return ticks;
  }, [rankMetric, step, yMax, yMin]);
  const activeLockedTeam = selectedTeams.includes(String(lockedTeam || "")) ? String(lockedTeam) : "";
  const settledRound = isPlaying ? Math.max(0, playbackFromRound) : revealRound;

  const seriesRowByTeamAndRound = useMemo(() => {
    const map = new Map<string, any>();
    selectedTeams.forEach((team) => {
      const series = Array.isArray(seriesByTeam[team]) ? seriesByTeam[team] : [];
      series.forEach((item) => {
        const round = numeric(item?.round, 0);
        if (round < 0) return;
        map.set(`${team}::${round}`, item);
      });
    });
    return map;
  }, [selectedTeams, seriesByTeam]);

  const normalizedRankByTeamAndRound = useMemo(() => {
    const map = new Map<string, number>();
    if (!rankMetric) return map;
    const pointsKey = metric === "rankNet" ? "pointsNet" : "pointsRaw";
    const rowsByRound = new Map<number, Array<{ team: string; round: number; points: number; goalDiff: number; goalsFor: number }>>();
    selectedTeams.forEach((team) => {
      const series = Array.isArray(seriesByTeam[team]) ? seriesByTeam[team] : [];
      series.forEach((item) => {
        const round = numeric(item?.round, 0);
        if (round < 0) return;
        const points = numeric(item?.[pointsKey], 0);
        const goalsFor = numeric(item?.goalsFor, 0);
        const goalsAgainst = numeric(item?.goalsAgainst, 0);
        const goalDiff = numeric(item?.goalDiff, goalsFor - goalsAgainst);
        const list = rowsByRound.get(round) || [];
        list.push({ team, round, points, goalDiff, goalsFor });
        rowsByRound.set(round, list);
      });
    });

    rowsByRound.forEach((list) => {
      list.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team));
      list.forEach((item, idx) => {
        map.set(`${item.team}::${item.round}`, idx + 1);
      });
    });
    return map;
  }, [metric, rankMetric, selectedTeams, seriesByTeam]);

  const getMetricValueAtRound = (team: string, round: number) => {
    const row = seriesRowByTeamAndRound.get(`${team}::${round}`);
    if (!row) return null;
    const rawValue = numeric(row?.[metric], rankMetric ? yMax : 0);
    if (!rankMetric) return rawValue;
    const normalizedRank = normalizedRankByTeamAndRound.get(`${team}::${round}`);
    return numeric(normalizedRank, rawValue);
  };

  const pointsByTeam = useMemo(() => {
    const out: Record<string, Array<{ team: string; round: number; value: number; x: number; y: number }>> = {};
    selectedTeams.forEach((team) => {
      const series = Array.isArray(seriesByTeam[team]) ? seriesByTeam[team] : [];
      const points = series
        .map((item) => {
          const round = numeric(item?.round, 0);
          const value = getMetricValueAtRound(team, round);
          return {
            team,
            round,
            value: numeric(value, rankMetric ? yMax : 0),
            x: xAt(round),
            y: yAt(numeric(value, rankMetric ? yMax : 0))
          };
        })
        .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y) && item.round >= 0 && item.round <= settledRound);
      out[team] = points;
    });
    return out;
  }, [rankMetric, selectedTeams, seriesByTeam, settledRound, xAt, yAt, yMax]);

  const movingPointByTeam = useMemo(() => {
    const out = new Map<string, { team: string; round: number; value: number; x: number; y: number }>();
    if (!isPlaying) return out;
    if (playbackToRound <= playbackFromRound) return out;
    const fromX = xAt(playbackFromRound);
    const toX = xAt(playbackToRound);
    selectedTeams.forEach((team) => {
      const fromValue = getMetricValueAtRound(team, playbackFromRound);
      const toValue = getMetricValueAtRound(team, playbackToRound);
      if (fromValue === null || toValue === null) return;
      const value = lerp(fromValue, toValue, playbackProgress);
      out.set(team, {
        team,
        round: playbackToRound,
        value,
        x: lerp(fromX, toX, playbackProgress),
        y: yAt(value)
      });
    });
    return out;
  }, [isPlaying, playbackFromRound, playbackProgress, playbackToRound, selectedTeams, xAt, yAt]);

  const persistPointByTeam = useMemo(() => {
    const out = new Map<string, { team: string; round: number; value: number; x: number; y: number }>();
    if (isPlaying) return out;
    if (persistLogoRound < 0) return out;
    selectedTeams.forEach((team) => {
      const value = getMetricValueAtRound(team, persistLogoRound);
      if (value === null) return;
      out.set(team, {
        team,
        round: persistLogoRound,
        value,
        x: xAt(persistLogoRound),
        y: yAt(value)
      });
    });
    return out;
  }, [isPlaying, persistLogoRound, selectedTeams, xAt, yAt]);

  const clustersByKey = useMemo(() => {
    const map = new Map<string, { key: string; round: number; value: number; teams: string[] }>();
    selectedTeams.forEach((team) => {
      const points = Array.isArray(pointsByTeam[team]) ? pointsByTeam[team] : [];
      points.forEach((point) => {
        const key = `${point.round}::${point.value}`;
        const existing = map.get(key);
        if (existing) {
          existing.teams.push(team);
          return;
        }
        map.set(key, {
          key,
          round: point.round,
          value: point.value,
          teams: [team]
        });
      });
    });
    return map;
  }, [pointsByTeam, selectedTeams]);

  const displayXByTeamRound = useMemo(() => {
    const out = new Map<string, number>();
    const roundsSet = new Set<number>();
    selectedTeams.forEach((team) => {
      const points = Array.isArray(pointsByTeam[team]) ? pointsByTeam[team] : [];
      points.forEach((point) => roundsSet.add(point.round));
      const logoPoint = movingPointByTeam.get(team) || persistPointByTeam.get(team);
      if (logoPoint) roundsSet.add(logoPoint.round);
    });

    roundsSet.forEach((round) => {
      const grouped = new Map<string, Array<{ team: string; x: number; isLogo: boolean }>>();
      selectedTeams.forEach((team) => {
        const settledPoint = (Array.isArray(pointsByTeam[team]) ? pointsByTeam[team] : []).find((row) => row.round === round) || null;
        const logoPoint = (movingPointByTeam.get(team) || persistPointByTeam.get(team)) || null;
        const useLogo = Boolean(logoPoint && logoPoint.round === round);
        const point = useLogo ? logoPoint : settledPoint;
        if (!point) return;
        const key = `${round}::${point.value}`;
        const list = grouped.get(key) || [];
        list.push({ team, x: point.x, isLogo: useLogo });
        grouped.set(key, list);
      });

      grouped.forEach((list) => {
        if (list.length <= 1) {
          const item = list[0];
          if (!item) return;
          out.set(`${item.team}::${round}`, item.x);
          return;
        }
        const hasLogo = list.some((item) => item.isLogo);
        const baseStep = hasLogo ? LOGO_OFFSET_STEP : POINT_OFFSET_STEP;
        const maxDistance = (list.length - 1) * baseStep;
        const scale = maxDistance > MAX_OFFSET_SPREAD ? MAX_OFFSET_SPREAD / maxDistance : 1;
        const sorted = [...list].sort((a, b) => a.team.localeCompare(b.team));
        sorted.forEach((item, idx) => {
          const offset = (idx - (sorted.length - 1) / 2) * baseStep * scale;
          out.set(`${item.team}::${round}`, item.x + offset);
        });
      });
    });
    return out;
  }, [movingPointByTeam, persistPointByTeam, pointsByTeam, selectedTeams]);

  const tooltipPayload = useMemo(() => {
    if (!hasRound) return "";
    if (hoveredClusterKey && hoveredRound !== null) {
      const cluster = clustersByKey.get(hoveredClusterKey);
      if (cluster) {
        const maxList = 4;
        const total = cluster.teams.length;
        const names = cluster.teams.slice(0, maxList).join("、");
        const suffix = total > maxList ? ` 等${total}队` : "";
        return `R${hoveredRound} | ${metricLabel}：${cluster.value} | 同值${total}队：${names}${suffix}`;
      }
    }
    if (hoveredTeam && hoveredRound !== null) {
      const value = getMetricValueAtRound(hoveredTeam, hoveredRound);
      if (value !== null) return `R${hoveredRound} | ${hoveredTeam} | ${metricLabel}：${value}`;
    }
    if (hoveredRound !== null) {
      if (!activeLockedTeam) return `R${hoveredRound} | 请点击左侧球队名称锁定高亮，或悬浮任意球队点位`;
      const team = activeLockedTeam;
      const value = getMetricValueAtRound(team, hoveredRound);
      if (value !== null) return `R${hoveredRound} | ${team} | ${metricLabel}：${value}`;
      return `R${hoveredRound} | ${team} | ${metricLabel}：-`;
    }
    return "";
  }, [activeLockedTeam, clustersByKey, hasRound, hoveredClusterKey, hoveredRound, hoveredTeam, metricLabel]);

  const activeRound = hoveredRound !== null ? hoveredRound : isPlaying ? playbackFromRound : revealRound >= 0 ? revealRound : null;
  const activeTeam = hoveredTeam || activeLockedTeam;
  const activeCluster = hoveredClusterKey && activeRound !== null ? clustersByKey.get(hoveredClusterKey) : null;
  const movingActive = activeTeam ? movingPointByTeam.get(activeTeam) : null;
  const activeValue = activeCluster
    ? numeric(activeCluster.value, NaN)
    : movingActive && isPlaying
      ? numeric(movingActive.value, NaN)
      : activeRound !== null && activeTeam
        ? numeric(getMetricValueAtRound(activeTeam, activeRound), NaN)
        : NaN;

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
            setHoveredClusterKey(null);
          }}
        >
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="#fffdf8"
            onClick={() => {
              onClearLockedTeam();
              setHoveredRound(null);
              setHoveredTeam(null);
              setHoveredClusterKey(null);
            }}
          />
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

          <line x1={padL} y1={netPointsMetric ? yAt(0) : padT + plotH} x2={padL + plotW} y2={netPointsMetric ? yAt(0) : padT + plotH} stroke="#8d7f6f" />
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
            const roundReachable = round <= settledRound;
            return (
              <g key={`xt-${round}`}>
                <circle cx={x} cy={padT + plotH} r={2.1} fill={isActiveRound ? "#7a201d" : "#8d7f6f"} />
                <text
                  x={x}
                  y={padT + plotH + 16}
                  textAnchor="end"
                  transform={`rotate(45 ${x} ${padT + plotH + 16})`}
                  className={`csl-axis-text csl-axis-text-x${isActiveRound ? " active" : ""}`}
                  onMouseEnter={() => {
                    if (!roundReachable) return;
                    setHoveredRound(round);
                  }}
                  onMouseLeave={() => setHoveredRound(null)}
                  onClick={(e) => e.stopPropagation()}
                >
                  R{round}
                </text>
              </g>
            );
          })}

          {selectedTeams.map((team) => {
            const settledPoints = Array.isArray(pointsByTeam[team]) ? pointsByTeam[team] : [];
            const movingPoint = movingPointByTeam.get(team);
            const persistPoint = persistPointByTeam.get(team);
            const movingLogo = String(logoByTeam[team] || "").trim();
            const logoPoint = movingPoint || persistPoint;
            const shouldShowLogo = Boolean(logoPoint && movingLogo && !failedLogoByTeam[team]);
            const pathPoints = movingPoint ? [...settledPoints, movingPoint] : settledPoints;
            const path = buildPath(pathPoints.map((p) => ({ x: p.x, y: p.y })));
            if (!path) return null;
            const teamActive = activeTeam === team;
            return (
              <g key={`${metric}-${team}`}>
                <path
                  d={path}
                  fill="none"
                  stroke={colorByTeam[team] || "#111"}
                  strokeWidth={teamActive ? 4.6 : 1.8}
                  opacity={teamActive || !activeTeam ? 1 : 0.42}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLockedTeam(team);
                  }}
                />
                {settledPoints.map((p, idx) => {
                  const px = numeric(displayXByTeamRound.get(`${team}::${p.round}`), p.x);
                  const pointActive = teamActive && activeRound === p.round;
                  return (
                    <g key={`${metric}-${team}-${idx}`}>
                      <circle cx={px} cy={p.y} r={pointActive ? 5.2 : 2.2} fill={colorByTeam[team] || "#111"} />
                      <circle
                        className="csl-point-hitbox"
                        cx={px}
                        cy={p.y}
                        r={8}
                        fill="transparent"
                        onMouseEnter={() => {
                          setHoveredTeam(team);
                          setHoveredRound(p.round);
                          setHoveredClusterKey(null);
                        }}
                        onMouseLeave={() => {
                          setHoveredTeam(null);
                          setHoveredRound(null);
                          setHoveredClusterKey(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </g>
                  );
                })}
                {logoPoint ? (
                  shouldShowLogo ? (
                    <g>
                      <circle
                        cx={numeric(displayXByTeamRound.get(`${team}::${logoPoint.round}`), logoPoint.x)}
                        cy={logoPoint.y}
                        r={teamActive ? 8.5 : 7.2}
                        fill="#fff"
                        stroke={colorByTeam[team] || "#111"}
                        strokeWidth={1}
                      />
                      <image
                        x={numeric(displayXByTeamRound.get(`${team}::${logoPoint.round}`), logoPoint.x) - (teamActive ? 7.5 : 6.5)}
                        y={logoPoint.y - (teamActive ? 7.5 : 6.5)}
                        width={teamActive ? 15 : 13}
                        height={teamActive ? 15 : 13}
                        href={movingLogo}
                        preserveAspectRatio="xMidYMid meet"
                        onError={() => onLogoError(team)}
                        style={{ pointerEvents: "none" }}
                      />
                    </g>
                  ) : (
                    <circle
                      cx={numeric(displayXByTeamRound.get(`${team}::${logoPoint.round}`), logoPoint.x)}
                      cy={logoPoint.y}
                      r={teamActive ? 4.6 : 3.1}
                      fill={colorByTeam[team] || "#111"}
                    />
                  )
                ) : null}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function CslStandingsTrendPage({ mappingRevision = 0 }) {
  const defaultMetrics = ["points", "pointsNet", "rank", "rankNet", "goalsFor", "goalsAgainst"];
  const apiBaseLabel = getApiBaseLabel();
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
  const [lockedTeamByDataset, setLockedTeamByDataset] = useState(() => readLocalStore(STORAGE_KEYS.cslStandingsLockedTeamByDataset, {}));
  const [playRoundByDataset, setPlayRoundByDataset] = useState(() => readLocalStore(STORAGE_KEYS.cslStandingsPlayRoundByDataset, {}));
  const [playSpeedMs, setPlaySpeedMs] = useState(() => clampPlaySpeedMs(readLocalStore(STORAGE_KEYS.cslStandingsPlaySpeedMs, PLAY_SPEED_DEFAULT_MS)));
  const [isPlaying, setIsPlaying] = useState(false);
  const [transitionFromRound, setTransitionFromRound] = useState(0);
  const [transitionToRound, setTransitionToRound] = useState(0);
  const [transitionProgress, setTransitionProgress] = useState(1);
  const [persistLogoRound, setPersistLogoRound] = useState(-1);
  const [failedLogoByTeam, setFailedLogoByTeam] = useState<Record<string, boolean>>({});
  const [datasetDoc, setDatasetDoc] = useState(null as any);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const playRunIdRef = useRef(0);

  const backendOnline = backendHealth === "online";

  const seasons = useMemo(
    () => (Array.isArray(datasetDoc?.seasons) ? datasetDoc.seasons.map((item: any) => String(item)) : []),
    [datasetDoc]
  );
  const normalizedTrendData = useMemo(() => normalizeTrendData(datasetDoc), [datasetDoc]);

  const rounds = normalizedTrendData.rounds;
  const teams = normalizedTrendData.teams;

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
    if (current >= 0 && rounds.includes(current)) return current;
    return rounds.length > 0 ? rounds[rounds.length - 1] : 0;
  }, [selectedDatasetId, selectedRoundByDataset, rounds]);
  const playRound = useMemo(() => {
    if (!selectedDatasetId) return 0;
    const current = numeric(playRoundByDataset[selectedDatasetId], 0);
    if (current >= 0 && rounds.includes(current)) return current;
    return rounds.length > 0 ? rounds[0] : 0;
  }, [playRoundByDataset, rounds, selectedDatasetId]);
  const revealRound = isPlaying ? Math.max(0, transitionFromRound) : rounds.length > 0 ? rounds[rounds.length - 1] : 0;
  const playbackRoundLabel = rounds.length > 0 ? (isPlaying ? Math.max(0, transitionFromRound) : playRound >= 0 ? playRound : rounds[0]) : 0;

  const lockedTeam = useMemo(() => {
    if (!selectedDatasetId) return "";
    const raw = String(lockedTeamByDataset[selectedDatasetId] || "");
    return selectedTeams.includes(raw) ? raw : "";
  }, [lockedTeamByDataset, selectedDatasetId, selectedTeams]);

  const standingsRows = useMemo(() => {
    const snapshots = Array.isArray(normalizedTrendData.standingsByRound) ? normalizedTrendData.standingsByRound : [];
    const found = snapshots.find((item: any) => numeric(item?.round, 0) === selectedRound);
    return Array.isArray(found?.rows) ? found.rows : [];
  }, [normalizedTrendData, selectedRound]);

  const seriesByTeam = useMemo(() => {
    const map = normalizedTrendData?.trendSeriesByTeam;
    return map && typeof map === "object" ? map : {};
  }, [normalizedTrendData]);

  const teamMappingByName = useMemo(() => getTeamMappingRowsByName(), [mappingRevision]);

  const colorByTeam = useMemo(() => {
    const out: Record<string, string> = {};
    teams.forEach((team, idx) => {
      const key = normalizeTeamName(team).toLowerCase();
      const mappedColor = normalizeHexColor(key ? teamMappingByName.get(key)?.color : "");
      out[team] = mappedColor || TEAM_COLORS[idx % TEAM_COLORS.length];
    });
    return out;
  }, [teamMappingByName, teams]);
  const logoByTeam = useMemo(() => {
    const out: Record<string, string> = {};
    teams.forEach((team) => {
      const key = normalizeTeamName(team).toLowerCase();
      out[team] = String(key ? teamMappingByName.get(key)?.logoDataUrl || "" : "").trim();
    });
    return out;
  }, [teamMappingByName, teams]);

  const stopRaf = () => {
    playRunIdRef.current += 1;
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  };

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

  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.cslStandingsLockedTeamByDataset, lockedTeamByDataset);
  }, [lockedTeamByDataset]);
  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.cslStandingsPlayRoundByDataset, playRoundByDataset);
  }, [playRoundByDataset]);
  useEffect(() => {
    writeLocalStore(STORAGE_KEYS.cslStandingsPlaySpeedMs, playSpeedMs);
  }, [playSpeedMs]);

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
    stopRaf();
    setIsPlaying(false);
    setTransitionFromRound(0);
    setTransitionToRound(0);
    setTransitionProgress(1);
    setPersistLogoRound(-1);
    setFailedLogoByTeam({});
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
    if (current >= 0 && rounds.includes(current)) return;
    setSelectedRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: rounds[rounds.length - 1] }));
  }, [selectedDatasetId, rounds, selectedRoundByDataset]);
  useEffect(() => {
    if (!selectedDatasetId) return;
    if (rounds.length === 0) return;
    const current = numeric(playRoundByDataset[selectedDatasetId], 0);
    if (current >= 0 && rounds.includes(current)) return;
    setPlayRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: rounds[0] }));
  }, [playRoundByDataset, rounds, selectedDatasetId]);
  useEffect(() => {
    if (!selectedDatasetId || isPlaying) return;
    if (selectedRound < 0) return;
    const currentPlayRound = numeric(playRoundByDataset[selectedDatasetId], 0);
    if (currentPlayRound === selectedRound) return;
    setPlayRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: selectedRound }));
  }, [isPlaying, playRoundByDataset, selectedDatasetId, selectedRound]);

  useEffect(() => {
    if (!selectedDatasetId || rounds.length === 0 || isPlaying) return;
    const current = numeric(playRoundByDataset[selectedDatasetId], rounds[0]);
    const stableRound = rounds.includes(current) ? current : rounds[0];
    setTransitionFromRound(stableRound);
    setTransitionToRound(stableRound);
    setTransitionProgress(1);
  }, [isPlaying, playRoundByDataset, rounds, selectedDatasetId]);

  useEffect(() => {
    return () => stopRaf();
  }, []);

  useEffect(() => {
    stopRaf();
    if (!isPlaying) return;
    if (!selectedDatasetId) return;
    if (rounds.length === 0) return;
    const firstRound = rounds[0];
    const current = rounds.includes(playRound) ? playRound : firstRound;
    const currentIdx = rounds.indexOf(current);
    if (currentIdx < 0 || currentIdx >= rounds.length - 1) {
      const lastRound = rounds[rounds.length - 1];
      setIsPlaying(false);
      setPlayRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: lastRound }));
      setSelectedRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: lastRound }));
      setTransitionFromRound(lastRound);
      setTransitionToRound(lastRound);
      setTransitionProgress(1);
      return;
    }

    let fromRound = current;
    let toRound = rounds[currentIdx + 1];
    let segmentStart = 0;
    let awaitingNextSegment = false;
    const runId = playRunIdRef.current;
    setTransitionFromRound(fromRound);
    setTransitionToRound(toRound);
    setTransitionProgress(0);

    const tick = (ts: number) => {
      if (runId !== playRunIdRef.current) return;
      if (awaitingNextSegment) {
        const idx = rounds.indexOf(fromRound);
        if (idx < 0 || idx >= rounds.length - 1) {
          setIsPlaying(false);
          setPersistLogoRound(fromRound);
          setTransitionFromRound(fromRound);
          setTransitionToRound(fromRound);
          setTransitionProgress(1);
          if (rafIdRef.current !== null) {
            window.cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          return;
        }
        toRound = rounds[idx + 1];
        segmentStart = ts;
        awaitingNextSegment = false;
        setTransitionFromRound(fromRound);
        setTransitionToRound(toRound);
        setTransitionProgress(0);
        rafIdRef.current = window.requestAnimationFrame(tick);
        return;
      }
      if (segmentStart <= 0) segmentStart = ts;
      const elapsed = ts - segmentStart;
      const raw = Math.min(1, Math.max(0, elapsed / Math.max(1, playSpeedMs)));
      const eased = easeInOutCubic(raw);
      setTransitionProgress(eased);

      if (raw >= 1) {
        const reachedRound = toRound;
        setPlayRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: reachedRound }));
        setSelectedRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: reachedRound }));
        fromRound = reachedRound;
        setTransitionFromRound(reachedRound);
        setTransitionToRound(reachedRound);
        setTransitionProgress(1);
        awaitingNextSegment = true;
        rafIdRef.current = window.requestAnimationFrame(tick);
        return;
      }

      rafIdRef.current = window.requestAnimationFrame(tick);
    };

    rafIdRef.current = window.requestAnimationFrame(tick);
    return () => stopRaf();
  }, [isPlaying, playSpeedMs, rounds, selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    const current = String(lockedTeamByDataset[selectedDatasetId] || "");
    if (!current) return;
    if (selectedTeams.includes(current)) return;
    setLockedTeamByDataset((old: any) => ({ ...old, [selectedDatasetId]: "" }));
  }, [lockedTeamByDataset, selectedDatasetId, selectedTeams]);

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

  const toggleLockedTeam = (team: string) => {
    if (!selectedDatasetId) return;
    setLockedTeamByDataset((prev: any) => {
      const current = String(prev[selectedDatasetId] || "");
      return {
        ...prev,
        [selectedDatasetId]: current === team ? "" : team
      };
    });
  };

  const clearLockedTeam = () => {
    if (!selectedDatasetId) return;
    setLockedTeamByDataset((prev: any) => ({
      ...prev,
      [selectedDatasetId]: ""
    }));
  };
  const handleTogglePlay = () => {
    if (!selectedDatasetId || rounds.length === 0) return;
    if (isPlaying) {
      stopRaf();
      setIsPlaying(false);
      setPersistLogoRound(Math.max(0, transitionFromRound));
      return;
    }
    const firstRound = rounds[0];
    const startRound = firstRound;
    const startIdx = rounds.indexOf(startRound);
    const nextRound = startIdx >= 0 && startIdx < rounds.length - 1 ? rounds[startIdx + 1] : startRound;
    setPersistLogoRound(-1);
    setTransitionFromRound(startRound);
    setTransitionToRound(nextRound);
    setTransitionProgress(0);
    setPlayRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: startRound }));
    setSelectedRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: startRound }));
    setIsPlaying(true);
  };
  const handleReplay = () => {
    if (!selectedDatasetId || rounds.length === 0) return;
    const firstRound = rounds[0];
    stopRaf();
    setIsPlaying(false);
    setPersistLogoRound(-1);
    setPlayRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: firstRound }));
    setSelectedRoundByDataset((old: any) => ({ ...old, [selectedDatasetId]: firstRound }));
    setTransitionFromRound(firstRound);
    setTransitionToRound(firstRound);
    setTransitionProgress(1);
  };
  const handleLogoError = (team: string) => {
    if (!team) return;
    setFailedLogoByTeam((prev) => (prev[team] ? prev : { ...prev, [team]: true }));
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
          <p>{`轮次：${rounds.length > 0 ? `${rounds[0]}-${rounds[rounds.length - 1]}` : "-"}`}</p>
          <p>{`更新时间：${formatDateTime(datasetDoc?.updatedAt) || "-"}`}</p>
        </div>

        {!backendOnline ? <p className="msg err">{`导入已禁用：后端未连接（当前 API：${apiBaseLabel}）`}</p> : null}
        {loading ? <p className="fitness-empty">数据加载中...</p> : null}
        {message ? <p className="msg ok">{message}</p> : null}
        {error ? <p className="msg err">{error}</p> : null}

        <div className="fitness-card csl-playback-bar">
          <div className="csl-playback-actions">
            <button className="fitness-top-control" onClick={handleTogglePlay} disabled={rounds.length === 0}>
              {isPlaying ? "暂停" : "播放"}
            </button>
            <button className="fitness-top-control" onClick={handleReplay} disabled={rounds.length === 0}>
              重播
            </button>
            <p className="csl-play-status">{rounds.length > 0 ? `第${playbackRoundLabel}轮 / 共${rounds.length}轮` : "暂无可播放轮次"}</p>
          </div>
          <label className="csl-speed-control">
            <span>{`播放速度：${playSpeedMs}ms/轮`}</span>
            <input
              className="csl-speed-slider"
              type="range"
              min={PLAY_SPEED_MIN_MS}
              max={PLAY_SPEED_MAX_MS}
              step={PLAY_SPEED_STEP_MS}
              value={playSpeedMs}
              onChange={(e) => setPlaySpeedMs(clampPlaySpeedMs(e.target.value))}
              disabled={rounds.length === 0}
            />
          </label>
        </div>

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
                <div key={team} className="csl-check-item">
                  <input type="checkbox" checked={selectedTeams.includes(team)} onChange={() => toggleTeam(team)} />
                  <button
                    type="button"
                    className={`csl-team-label csl-team-name-btn${lockedTeam === team ? " is-locked" : ""}`}
                    title={team}
                    aria-pressed={lockedTeam === team}
                    onClick={() => toggleLockedTeam(team)}
                  >
                    <i style={{ background: colorByTeam[team] || "#111" }} />
                    {team}
                  </button>
                </div>
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
                  value={selectedRound >= 0 ? selectedRound : ""}
                  onChange={(e) => {
                    const value = numeric(e.target.value, 0);
                    if (!selectedDatasetId || value < 0) return;
                    stopRaf();
                    setIsPlaying(false);
                    setSelectedRoundByDataset((prev: any) => ({ ...prev, [selectedDatasetId]: value }));
                    setPlayRoundByDataset((prev: any) => ({ ...prev, [selectedDatasetId]: value }));
                    setTransitionFromRound(value);
                    setTransitionToRound(value);
                    setTransitionProgress(1);
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
                revealRound={revealRound}
                playbackFromRound={transitionFromRound}
                playbackToRound={transitionToRound}
                playbackProgress={transitionProgress}
                isPlaying={isPlaying}
                rounds={rounds}
                selectedTeams={selectedTeams}
                seriesByTeam={seriesByTeam}
                colorByTeam={colorByTeam}
                logoByTeam={logoByTeam}
                failedLogoByTeam={failedLogoByTeam}
                persistLogoRound={persistLogoRound}
                lockedTeam={lockedTeam}
                onLogoError={handleLogoError}
                onToggleLockedTeam={toggleLockedTeam}
                onClearLockedTeam={clearLockedTeam}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default CslStandingsTrendPage;
