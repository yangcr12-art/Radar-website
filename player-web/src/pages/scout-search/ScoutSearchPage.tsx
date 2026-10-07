import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  evaluateScoutSearch,
  deletePlayerDataset,
  fetchPlayerDatasets,
  fetchScoutingModels,
  importPlayerExcel
} from "../../api/storageClient";
import { DEFAULT_TIER_COLORS } from "../../app/constants";
import { getProjectZhByColumn } from "../../utils/projectMappingStore";

type DatasetOption = {
  id: string;
  name: string;
  playerCount?: number;
};

type MetricResult = {
  column: string;
  label?: string;
  note?: string;
  matchedColumn: string;
  sourceColumns?: string[];
  dimensionId: string;
  dimensionName: string;
  weight: number;
  rawValue: number | null;
  rawPercentile: number;
  percentile: number;
  scoringPercentile?: number;
  eliteMetricBonus?: number;
  eliteEligible?: boolean;
  eliteRawCeiling?: number;
  smoothingAlpha: number;
  zeroShare: number;
  zeroFloorPercentile?: number | null;
  smoothingReason: string;
  coupledGroupId?: string;
  coupledGroupLabel?: string;
  coupledFormula?: string;
  coupledComponents?: {
    volumeScore: number;
    successfulScore: number;
    rateScore: number;
    adjustedRate: number;
    successfulPer90: number;
  } | null;
  available: boolean;
  rawContribution: number;
  contribution: number;
};

type DimensionResult = {
  id: string;
  name: string;
  weight: number;
  score: number;
  completeness: number;
};

type ScoredPlayer = {
  id: string;
  rank: number;
  player: string;
  team: string;
  age: string | number;
  position: string;
  foot: string;
  minutes: number;
  matches: number;
  avgMinutes: number;
  baseScore: number;
  rawScore: number;
  score: number;
  reliability: number;
  completeness: number;
  dimensions: DimensionResult[];
  metrics: MetricResult[];
  strengths: string[];
  risks: string[];
  roleFitScore?: number | null;
  roleFitProbability?: number | null;
  archetype?: {
    enabled: boolean;
    label: string;
    status: "clear" | "leaning" | "uncertain" | "insufficient";
    primaryRoleId: string;
    primaryName: string;
    secondaryRoleId: string;
    secondaryName: string;
    margin: number;
    probabilityGap: number;
    relativeSeparation: number;
    decisionStrength: number;
    roleClarity?: number;
    dataConfidence?: number;
    confidence: number;
    coverage: number;
    minuteReliability: number;
    positionReliability: number;
    positionContext: string;
    denominatorMode: string;
    activitySide?: "主要左侧活动" | "主要右侧活动" | "左右活动侧暂不明确";
    completeForwardGate?: {
      eligible: boolean;
      reasons: string[];
      availableAxisCount: number;
      activityCoverage: number;
      breadthFloor: number;
      balance: number;
      score: number | null;
      axes: Array<{ name: string; score: number | null }>;
      definition: string;
    };
    fits: Array<{
      roleId: string;
      name: string;
      score: number;
      distance: number;
      baseScore: number;
      baseDistance: number;
      distanceAdjustment: number;
      adjustmentReason: string;
      evidenceScore: number | null;
      evidenceCoverage: number;
      evidenceComponents: Array<{ id: string; value: number | null; weight: number; available: boolean }>;
      similarity?: number;
      probability: number;
      eligible: boolean;
      eligibilityReason: string;
    }>;
    pillars: Array<{ id: string; name: string; score: number | null; coverage: number }>;
  } | null;
};

type RankedPlayer = ScoredPlayer & {
  selectedRank: number;
  selectedBaseScore: number;
  selectedRawScore: number;
  selectedScore: number;
};

type MetricDefinition = {
  column: string;
  label?: string;
  note?: string;
  weight: number;
  direction: string;
  matchedColumn: string;
  validCohortCount: number;
  available: boolean;
  coupledGroupId?: string;
  coupledGroupLabel?: string;
  coupledFormula?: string;
};

type DisplayMetricResult = MetricResult & { members: MetricResult[] };
type DisplayMetricDefinition = MetricDefinition & { members: MetricDefinition[] };

type ModelDimension = {
  id: string;
  name: string;
  weight: number;
  metrics: MetricDefinition[];
};

type EvaluationResult = {
  model: {
    id: string;
    version: string;
    name: string;
    family: string;
    qualityLevel: string;
    description: string;
    positionTokens: string[];
    usesFootFilter: boolean;
    confirmedLabel: string;
    pendingLabel: string;
    excludedLabel: string;
    dimensions: ModelDimension[];
    notScored: Array<{ column: string; reason: string }>;
  };
  settings: {
    earlySeason: boolean;
    minMinutes: number;
    minAvgMinutes: number;
    reliabilityMinutes: number;
    percentileMode: string;
    contributionMode: string;
    forwardExperimentEnabled?: boolean;
    wingerExperimentEnabled?: boolean;
    attackingMidfielderExperimentEnabled?: boolean;
    centralMidfielderExperimentEnabled?: boolean;
    roleSimilarityEnabled?: boolean;
    coupledMetricMode?: string;
    eliteThreshold?: number;
    eliteMode?: string;
    eliteMaxPoints?: number;
    reliabilityBaseline?: number;
  };
  summary: {
    datasetPlayerCount: number;
    comparisonCohortCount: number;
    confirmedCount: number;
    pendingCount: number;
    footExcludedCount: number;
    rightFootExcludedCount: number;
    sampleExcludedCount: number;
    modelCoverage: number;
    scoreAvailable: boolean;
    qualityLevel: string;
    forwardExperimentEnabled?: boolean;
    wingerExperimentEnabled?: boolean;
    attackingMidfielderExperimentEnabled?: boolean;
    centralMidfielderExperimentEnabled?: boolean;
    roleSimilarityEnabled?: boolean;
    coupledGroupCount?: number;
    archetypeAvailable?: boolean;
  };
  confirmed: ScoredPlayer[];
  pending: ScoredPlayer[];
};

type ActiveListKey = "confirmed" | "pending" | "leftWing" | "rightWing" | "sidePending";

function wingerRowsBySide(result: EvaluationResult) {
  const eligibleRows = [...result.confirmed, ...result.pending];
  return {
    leftWing: eligibleRows.filter((player) => player.archetype?.activitySide === "主要左侧活动"),
    rightWing: eligibleRows.filter((player) => player.archetype?.activitySide === "主要右侧活动"),
    sidePending: eligibleRows.filter((player) => !["主要左侧活动", "主要右侧活动"].includes(player.archetype?.activitySide || ""))
  };
}

type MetricPreset = {
  id?: string;
  name?: string;
  columns?: string[];
};

type ScoutSearchPageProps = {
  playerMetricPresets?: MetricPreset[];
  mappingRevision?: number;
};

const RANKING_PAGE_SIZE = 20;

function formatNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (Math.abs(number) >= 100) return String(Math.round(number));
  return number.toFixed(2).replace(/\.?0+$/, "");
}

function scoreTone(score: number) {
  if (score >= 75) return "is-high";
  if (score >= 60) return "is-positive";
  if (score < 45) return "is-low";
  return "";
}

function percentileColor(percentile: number) {
  if (percentile >= 90) return DEFAULT_TIER_COLORS.elite;
  if (percentile >= 65) return DEFAULT_TIER_COLORS.above_avg;
  if (percentile >= 34) return DEFAULT_TIER_COLORS.avg;
  return DEFAULT_TIER_COLORS.bottom;
}

function percentileStyle(percentile: number) {
  const color = percentileColor(percentile);
  return { color, borderColor: `${color}55`, backgroundColor: `${color}14` };
}

function selectedMetricContribution(metric: MetricResult, selectedWeight: number, reliability: number) {
  if (selectedWeight <= 0) return 0;
  return reliability * (metric.weight / selectedWeight) * ((metric.scoringPercentile ?? metric.percentile) - 50);
}

function mergeCoupledMetricResults(metrics: MetricResult[]): DisplayMetricResult[] {
  const output: DisplayMetricResult[] = [];
  const groups = new Map<string, DisplayMetricResult>();
  metrics.forEach((metric) => {
    const groupId = metric.coupledGroupId;
    if (!groupId) {
      output.push({ ...metric, members: [metric] });
      return;
    }
    const key = `${metric.dimensionId}:${groupId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.members.push(metric);
      existing.weight += metric.weight;
      existing.rawContribution += metric.rawContribution;
      existing.contribution += metric.contribution;
      existing.available = existing.available && metric.available;
      return;
    }
    const merged: DisplayMetricResult = {
      ...metric,
      column: `coupled:${groupId}`,
      label: metric.coupledGroupLabel || metric.label || metric.column,
      rawValue: null,
      members: [metric]
    };
    groups.set(key, merged);
    output.push(merged);
  });
  return output;
}

function mergeCoupledMetricDefinitions(metrics: MetricDefinition[]): DisplayMetricDefinition[] {
  const output: DisplayMetricDefinition[] = [];
  const groups = new Map<string, DisplayMetricDefinition>();
  metrics.forEach((metric) => {
    const groupId = metric.coupledGroupId;
    if (!groupId) {
      output.push({ ...metric, members: [metric] });
      return;
    }
    const existing = groups.get(groupId);
    if (existing) {
      existing.members.push(metric);
      existing.weight += metric.weight;
      existing.available = existing.available && metric.available;
      existing.validCohortCount = Math.min(existing.validCohortCount, metric.validCohortCount);
      return;
    }
    const merged: DisplayMetricDefinition = {
      ...metric,
      column: `coupled:${groupId}`,
      label: metric.coupledGroupLabel || metric.label || metric.column,
      members: [metric]
    };
    groups.set(groupId, merged);
    output.push(merged);
  });
  return output;
}

function selectedQualityScores(
  player: ScoredPlayer,
  selectedDimensionIds: string[],
  selectedWeight: number,
  settings: EvaluationResult["settings"]
) {
  const selectedMetrics = player.metrics.filter((metric) => selectedDimensionIds.includes(metric.dimensionId));
  const baseScore = selectedWeight > 0
    ? selectedMetrics.reduce((sum, metric) => sum + metric.percentile * metric.weight, 0) / selectedWeight
    : 50;
  const rawScore = selectedWeight > 0
    ? selectedMetrics.reduce((sum, metric) => sum + (metric.scoringPercentile ?? metric.percentile) * metric.weight, 0) / selectedWeight
    : 50;
  const baseline = Number(settings.reliabilityBaseline ?? 50);
  const score = baseline + player.reliability * (rawScore - baseline);
  return { baseScore, rawScore, score };
}

function ScoutSearchPage({ playerMetricPresets = [], mappingRevision = 0 }: ScoutSearchPageProps) {
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [modelOptions, setModelOptions] = useState<Array<{ id: string; name: string; family: string; description: string }>>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("target_forward");
  const [earlySeason, setEarlySeason] = useState(false);
  const [minMinutes, setMinMinutes] = useState(300);
  const [minAvgMinutes, setMinAvgMinutes] = useState(15);
  const [reliabilityMinutes, setReliabilityMinutes] = useState(500);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [activeList, setActiveList] = useState<ActiveListKey>("confirmed");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedDimensionIds, setSelectedDimensionIds] = useState<string[]>([]);
  const [hiddenPlayerIds, setHiddenPlayerIds] = useState<string[]>([]);
  const [showHiddenPlayers, setShowHiddenPlayers] = useState(false);
  const [rankingPage, setRankingPage] = useState(1);
  const [rankingMode, setRankingMode] = useState<"ability" | "fit">("ability");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const metricLabel = (column: string) => {
    void mappingRevision;
    return getProjectZhByColumn(column) || column;
  };

  const displayedMetricLabel = (metric: { column: string; label?: string }) =>
    metric.label || metricLabel(metric.column);

  const loadDatasets = async (preferredId = "") => {
    const response = await fetchPlayerDatasets();
    const nextDatasets = Array.isArray(response.datasets) ? response.datasets : [];
    setDatasets(nextDatasets);
    const nextId =
      (preferredId && nextDatasets.some((item: DatasetOption) => item.id === preferredId) && preferredId) ||
      String(response.selectedDatasetId || nextDatasets[0]?.id || "");
    setSelectedDatasetId(nextId);
    return nextId;
  };

  useEffect(() => {
    let active = true;
    Promise.all([fetchPlayerDatasets(), fetchScoutingModels()])
      .then(([datasetResponse, modelResponse]) => {
        if (!active) return;
        const nextDatasets = Array.isArray(datasetResponse.datasets) ? datasetResponse.datasets : [];
        setDatasets(nextDatasets);
        setSelectedDatasetId(String(datasetResponse.selectedDatasetId || nextDatasets[0]?.id || ""));
        setModelOptions(Array.isArray(modelResponse.models) ? modelResponse.models : []);
      })
      .catch((err: Error) => {
        if (active) setError(`读取球探搜索配置失败：${err.message}`);
      });
    return () => {
      active = false;
    };
  }, []);

  const runEvaluation = async (datasetId = selectedDatasetId) => {
    if (!datasetId) {
      setError("请先选择或导入一个球员数据集。");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = (await evaluateScoutSearch({
        datasetId,
        roleId: selectedRoleId,
        earlySeason,
        minMinutes,
        minAvgMinutes,
        reliabilityMinutes
      })) as EvaluationResult;
      setResult(response);
      setSelectedDimensionIds(response.model.dimensions.map((dimension) => dimension.id));
      setHiddenPlayerIds([]);
      setShowHiddenPlayers(false);
      setRankingPage(1);
      const wingerGroups = response.settings.wingerExperimentEnabled ? wingerRowsBySide(response) : null;
      const nextActiveList: ActiveListKey = wingerGroups
        ? wingerGroups.leftWing.length > 0
          ? "leftWing"
          : wingerGroups.rightWing.length > 0
            ? "rightWing"
            : "sidePending"
        : response.confirmed.length > 0 ? "confirmed" : "pending";
      setActiveList(nextActiveList);
      const firstPlayer = wingerGroups
        ? wingerGroups[nextActiveList as "leftWing" | "rightWing" | "sidePending"][0]
        : nextActiveList === "confirmed" ? response.confirmed[0] : response.pending[0];
      setSelectedPlayerId(firstPlayer?.id || "");
      setMessage(`模型已运行：比较基准 ${response.summary.comparisonCohortCount} 人。`);
    } catch (err: any) {
      setResult(null);
      setSelectedPlayerId("");
      setSelectedDimensionIds([]);
      setHiddenPlayerIds([]);
      setRankingPage(1);
      setError(`评分失败：${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setError("");
    setMessage("");
    try {
      const response = await importPlayerExcel(file);
      const datasetId = await loadDatasets(String(response.datasetId || ""));
      setMessage(`已导入 ${response.playerCount || 0} 名球员，正在运行模型。`);
      await runEvaluation(datasetId);
    } catch (err: any) {
      setError(`导入失败：${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteDataset = async () => {
    if (!selectedDatasetId || loading || importing) return;
    const dataset = datasets.find((item) => item.id === selectedDatasetId);
    if (!window.confirm(`确认删除数据集“${dataset?.name || selectedDatasetId}”吗？删除后不可恢复。`)) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await deletePlayerDataset(selectedDatasetId);
      const nextDatasetId = await loadDatasets(String(response.selectedDatasetId || ""));
      setResult(null);
      setSelectedPlayerId("");
      setSelectedDimensionIds([]);
      setHiddenPlayerIds([]);
      setShowHiddenPlayers(false);
      setRankingPage(1);
      setMessage(nextDatasetId ? "已删除当前数据集，请重新运行职责模型。" : "已删除当前数据集。当前没有可用数据集。");
    } catch (err: any) {
      setError(`删除数据集失败：${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const rankedRows = useMemo<RankedPlayer[]>(() => {
    if (!result) return [];
    const wingerGroups = result.settings.wingerExperimentEnabled ? wingerRowsBySide(result) : null;
    const sourceRows = wingerGroups
      ? wingerGroups[activeList as "leftWing" | "rightWing" | "sidePending"] || []
      : result[activeList as "confirmed" | "pending"];
    const selectedDefinitions = result.model.dimensions.filter((dimension) => selectedDimensionIds.includes(dimension.id));
    const selectedWeight = selectedDefinitions.reduce((sum, dimension) => sum + dimension.weight, 0);
    return sourceRows
      .map((player) => {
        const selected = selectedQualityScores(player, selectedDimensionIds, selectedWeight, result.settings);
        return {
          ...player,
          selectedRank: 0,
          selectedBaseScore: selected.baseScore,
          selectedRawScore: selected.rawScore,
          selectedScore: selected.score
        };
      })
      .sort((a, b) => rankingMode === "fit"
        ? Number(b.roleFitScore ?? -1) - Number(a.roleFitScore ?? -1) || b.selectedScore - a.selectedScore || a.player.localeCompare(b.player)
        : b.selectedScore - a.selectedScore || b.selectedRawScore - a.selectedRawScore || a.player.localeCompare(b.player))
      .map((player, index) => ({ ...player, selectedRank: index + 1 }));
  }, [activeList, rankingMode, result, selectedDimensionIds]);

  const hiddenPlayerIdSet = useMemo(() => new Set(hiddenPlayerIds), [hiddenPlayerIds]);
  const activeRows = useMemo(() => rankedRows.filter((player) => !hiddenPlayerIdSet.has(player.id)), [hiddenPlayerIdSet, rankedRows]);
  const hiddenRows = useMemo(() => rankedRows.filter((player) => hiddenPlayerIdSet.has(player.id)), [hiddenPlayerIdSet, rankedRows]);
  const selectedPlayer = useMemo(
    () => activeRows.find((player) => player.id === selectedPlayerId) || activeRows[0] || null,
    [activeRows, selectedPlayerId]
  );
  const rankingPageCount = Math.max(1, Math.ceil(activeRows.length / RANKING_PAGE_SIZE));
  const pagedRows = useMemo(
    () => activeRows.slice((rankingPage - 1) * RANKING_PAGE_SIZE, rankingPage * RANKING_PAGE_SIZE),
    [activeRows, rankingPage]
  );

  useEffect(() => {
    setRankingPage(1);
    setSelectedPlayerId(rankedRows[0]?.id || "");
  }, [activeList, rankedRows, result?.model.id, selectedDimensionIds]);

  useEffect(() => {
    if (rankingPage > rankingPageCount) setRankingPage(rankingPageCount);
  }, [rankingPage, rankingPageCount]);

  const changeRankingPage = (nextPage: number) => {
    const page = Math.max(1, Math.min(rankingPageCount, nextPage));
    setRankingPage(page);
    setSelectedPlayerId(activeRows[(page - 1) * RANKING_PAGE_SIZE]?.id || "");
  };

  const selectedDimensions = useMemo(
    () => result?.model.dimensions.filter((dimension) => selectedDimensionIds.includes(dimension.id)) || [],
    [result, selectedDimensionIds]
  );
  const isForwardExperiment = Boolean(result?.settings.forwardExperimentEnabled);
  const isWingerExperiment = Boolean(result?.settings.wingerExperimentEnabled);
  const isAttackingMidfielderExperiment = Boolean(result?.settings.attackingMidfielderExperimentEnabled);
  const isCentralMidfielderExperiment = Boolean(result?.settings.centralMidfielderExperimentEnabled);
  const hasCoupledMetrics = Boolean(result?.settings.coupledMetricMode && result.settings.coupledMetricMode !== "off");
  const wingerSideGroups = useMemo(() => result && isWingerExperiment ? wingerRowsBySide(result) : null, [isWingerExperiment, result]);
  const isRoleSimilarityExperiment = Boolean(result?.settings.roleSimilarityEnabled || result?.summary.archetypeAvailable);
  const selectedDimensionWeight = selectedDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const selectedMetricContributionTotal = selectedPlayer
    ? selectedPlayer.metrics
        .filter((metric) => selectedDimensionIds.includes(metric.dimensionId))
        .reduce(
          (sum, metric) => sum + selectedMetricContribution(metric, selectedDimensionWeight, selectedPlayer.reliability),
          0
        )
    : 0;
  const selectedContributionTotal = selectedMetricContributionTotal;
  const selectedDisplayMetrics = useMemo(
    () => selectedPlayer
      ? mergeCoupledMetricResults(selectedPlayer.metrics.filter((metric) => selectedDimensionIds.includes(metric.dimensionId)))
      : [],
    [selectedDimensionIds, selectedPlayer]
  );

  const toggleDimension = (dimensionId: string) => {
    setSelectedDimensionIds((current) => {
      if (!current.includes(dimensionId)) return [...current, dimensionId];
      return current.length > 1 ? current.filter((id) => id !== dimensionId) : current;
    });
  };

  const hidePlayer = (playerId: string) => {
    setHiddenPlayerIds((current) => current.includes(playerId) ? current : [...current, playerId]);
    if (selectedPlayerId === playerId) setSelectedPlayerId("");
  };

  const restorePlayer = (playerId: string) => {
    setHiddenPlayerIds((current) => current.filter((id) => id !== playerId));
  };

  const rolePreset = useMemo(
    () => playerMetricPresets.find((preset) => String(preset.name || "").trim() === result?.model.family),
    [playerMetricPresets, result?.model.family]
  );
  const modelColumns = useMemo(
    () => result?.model.dimensions.flatMap((dimension) => dimension.metrics.map((metric) => metric.column)) || [],
    [result]
  );
  const presetOverlap = useMemo(() => {
    const presetColumns = new Set(rolePreset?.columns || []);
    return modelColumns.filter((column) => presetColumns.has(column)).length;
  }, [modelColumns, rolePreset]);

  return (
    <section className="info-page scout-search-page">
      <div className="info-card scout-search-shell">
        <header className="scout-search-header">
          <div>
            <p className="scout-search-kicker">Scouting Model Prototype</p>
            <h1>球探搜索</h1>
            <p>{result?.model.description || "按位置与职责独立建模；所有得分均可追溯到原始字段、比较群体和权重。"}</p>
          </div>
          <span className="scout-search-quality">Research · {result?.model.version || modelOptions[0]?.name || "职责样板"}</span>
        </header>

        <section className="scout-search-controls">
          <label>
            <span>球员数据集</span>
            <select value={selectedDatasetId} onChange={(event) => setSelectedDatasetId(event.target.value)}>
              {datasets.length === 0 ? <option value="">暂无数据集</option> : null}
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>职责</span>
            <select value={selectedRoleId} onChange={(event) => { setSelectedRoleId(event.target.value); setResult(null); setSelectedPlayerId(""); }}>
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>{`${model.family} · ${model.name}`}</option>
              ))}
            </select>
          </label>
          <label className="scout-search-season-field">
            <span>样本阶段</span>
            <span className="scout-search-check-control">
              <input type="checkbox" checked={earlySeason} onChange={(event) => setEarlySeason(event.target.checked)} />
              <b>赛季初期：不执行硬性出场门槛</b>
            </span>
          </label>
          <label>
            <span>最低出场分钟</span>
            <input type="number" min="0" step="30" value={minMinutes} disabled={earlySeason} onChange={(event) => setMinMinutes(Number(event.target.value))} />
          </label>
          <label>
            <span>最低场均分钟</span>
            <input type="number" min="0" step="1" value={minAvgMinutes} disabled={earlySeason} onChange={(event) => setMinAvgMinutes(Number(event.target.value))} />
          </label>
          <label>
            <span title="低于该分钟数时，原始职责分会按分钟比例向50分收缩；它不是入榜门槛。">满可靠度所需分钟</span>
            <input type="number" min="1" step="30" value={reliabilityMinutes} onChange={(event) => setReliabilityMinutes(Number(event.target.value))} />
          </label>
          <div className="scout-search-control-actions">
            <button type="button" onClick={() => runEvaluation()} disabled={loading || importing || !selectedDatasetId}>
              {loading ? "计算中..." : "运行职责模型"}
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading || importing}>
              {importing ? "导入中..." : "导入新 Excel"}
            </button>
            <button className="is-danger" type="button" onClick={handleDeleteDataset} disabled={loading || importing || !selectedDatasetId}>
              删除当前数据集
            </button>
            <input ref={fileInputRef} className="hidden-file" type="file" accept=".xlsx" onChange={handleImport} />
          </div>
        </section>

        {message ? <p className="msg ok">{message}</p> : null}
        {error ? <p className="msg err">{error}</p> : null}

        {result ? (
          <>
            <section className="scout-search-summary">
              <article><span>数据集球员</span><strong>{result.summary.datasetPlayerCount}</strong></article>
              <article><span>位置比较基准</span><strong>{result.summary.comparisonCohortCount}</strong></article>
              {isWingerExperiment ? (
                <>
                  <article><span>左边锋</span><strong>{wingerSideGroups?.leftWing.length || 0}</strong></article>
                  <article><span>右边锋</span><strong>{wingerSideGroups?.rightWing.length || 0}</strong></article>
                  <article><span>左右路待确认</span><strong>{wingerSideGroups?.sidePending.length || 0}</strong></article>
                </>
              ) : (
                <>
                  <article><span>{result.model.confirmedLabel}</span><strong>{result.summary.confirmedCount}</strong></article>
                  <article><span>{result.model.usesFootFilter ? result.model.pendingLabel : "样本门槛排除"}</span><strong>{result.model.usesFootFilter ? result.summary.pendingCount : result.summary.sampleExcludedCount}</strong></article>
                  <article><span>{result.model.usesFootFilter ? result.model.excludedLabel : "职责维度"}</span><strong>{result.model.usesFootFilter ? result.summary.footExcludedCount : result.model.dimensions.length}</strong></article>
                </>
              )}
              <article><span>模型覆盖率</span><strong>{Math.round(result.summary.modelCoverage * 100)}%</strong></article>
            </section>

            {!result.summary.scoreAvailable ? (
              <p className="msg err">当前比较群体少于 8 人或模型覆盖率低于 70%，排名仅作数据检查，不应作为球探结论。</p>
            ) : null}

            <section className="scout-search-method">
              <div>
                <h2>算法口径</h2>
                <p>{`比较群体：符合 ${result.model.positionTokens.join(" / ")}，且通过当前出场门槛的全部球员${isWingerExperiment ? "；位置记录与左右路传中来源决定左、右边锋榜单，惯用脚只参与职责资格和可信度判断" : result.model.usesFootFilter ? "；足侧只决定榜单归类，不缩小百分位基准" : ""}。`}</p>
                <p>指标分：先计算并列中位标准百分位，再按样本量与零值集中程度进行平滑；非负指标的真实 0 另设零值门槛，平滑不得把 0 向上抬高。缺失值按中性 50 分计入。</p>
                {hasCoupledMetrics ? <p>量效耦合：当前职责中同时存在次数与成功率的对抗、空中对抗、盘带或射门转化指标，会合并为修正后的复合指标；成功率按实际尝试次数向同位置平均值收缩，再按次数35%、调整成功次数45%、调整成功率20%合成。</p> : null}
                <p>尖点奖励适用于所有职责并逐项计入：标准排名进入前10%的指标，从第90百分位开始线性增加，排名第一最多获得15分，并直接写入该指标的计分百分位与贡献；量效耦合组只计算一次。</p>
                {isForwardExperiment ? <p>职责识别独立于能力分：五种中锋分别计算0–100行为相似度，不做合计100%的概率归一；CF不是第一位置时会降低数据可信度。数据可信度和职责区分度都不参与能力分或相似度。</p> : null}
                {isWingerExperiment ? <p>边锋职责识别独立于能力分：先形成边路传中、持球突破、禁区威胁、纵深冲击、机会创造、连接参与、跑动防守和定位球参与八项中文行为支柱，再分别计算四种职责相似度；足侧与左右路传中来源只用于活动侧和职责资格判断。</p> : null}
                {isAttackingMidfielderExperiment ? <p>前腰职责识别独立于能力分：先形成接应连接、机会创造、传球推进、持球推进、禁区攻击、无球纵深、边肋活动和定位球参与八项行为支柱，再分别计算古典前腰、影锋和边前腰三种独立职责相似度。</p> : null}
                {isCentralMidfielderExperiment ? <p>中前卫职责识别独立于能力分：先形成覆盖跑动、防守参与、身体参与、持球推进、传球推进、控球连接、机会创造和后插上威胁八项行为支柱，再分别计算全场覆盖型、推进型和组织核心三种独立职责相似度。</p> : null}
                <p>贡献闭环：所选模块最终分 = 50 + Σ可靠度后贡献；每项贡献按该指标在所选模块中的原始权重比例计算。</p>
                <p>Goal − xG = 全部进球/90 − xG/90，用于衡量总体实际进球相对总体预期进球的超额表现。</p>
                <p>{`最终分 = 50 + min(1, 出场分钟 / ${result.settings.reliabilityMinutes}) × (原始职责分 - 50)`}</p>
                <p>{`${result.settings.reliabilityMinutes} 分钟表示原始职责分达到100%可靠度；低于该值只会把得分向50分收缩，不会单独决定是否入榜。`}</p>
                <p>{earlySeason ? "当前为赛季初期模式：不硬性排除低分钟球员，但仍执行可靠度收缩。" : `当前排除：少于 ${result.settings.minMinutes} 分钟，或场均少于 ${result.settings.minAvgMinutes} 分钟。`}</p>
              </div>
              <aside>
                <strong>现有配置参考</strong>
                <p>{rolePreset ? `“${result.model.family}”雷达预设共 ${rolePreset.columns?.length || 0} 项，本职责模型采用其中 ${presetOverlap} 项。` : `当前账号未找到名为“${result.model.family}”的雷达预设。`}</p>
                <p>中文名称优先读取项目对应表；项目对应表不改变指标权重和统计口径。</p>
              </aside>
            </section>

            <section className="scout-search-model-grid">
              {result.model.dimensions.map((dimension) => (
                <article key={dimension.id} className={`scout-search-model-card ${selectedDimensionIds.includes(dimension.id) ? "is-selected" : "is-unselected"}`}>
                  <header>
                    <label className="scout-search-dimension-toggle">
                      <input type="checkbox" checked={selectedDimensionIds.includes(dimension.id)} disabled={selectedDimensionIds.length === 1 && selectedDimensionIds.includes(dimension.id)} onChange={() => toggleDimension(dimension.id)} />
                      <strong>{dimension.name}</strong>
                    </label>
                    <span>{dimension.weight}%</span>
                  </header>
                  {mergeCoupledMetricDefinitions(dimension.metrics).map((metric) => (
                    <div key={metric.column} className={metric.available ? "" : "is-missing"}>
                      <span title={[
                        metric.members.length > 1 ? `由${metric.members.map((item) => `${displayedMetricLabel(item)} ${item.weight}%`).join(" + ")}组成` : metric.note,
                        metric.coupledFormula
                      ].filter(Boolean).join("；") || undefined}>{displayedMetricLabel(metric)}</span>
                      <small>{`${metric.weight}% · ${metric.available ? `样本 ${metric.validCohortCount}` : "不可用"}`}</small>
                    </div>
                  ))}
                </article>
              ))}
            </section>

            <section className="scout-search-selection-summary">
              <div>
                <strong>{`当前排名：${selectedDimensions.map((dimension) => dimension.name).join(" + ")}`}</strong>
                <span>{`沿用原始权重比例 · 已选权重 ${selectedDimensionWeight}%`}</span>
              </div>
              <button type="button" onClick={() => setSelectedDimensionIds(result.model.dimensions.map((dimension) => dimension.id))} disabled={selectedDimensionIds.length === result.model.dimensions.length}>选择全部模块</button>
            </section>

            <section className="scout-search-ranking">
              <div className="scout-search-ranking-head">
                <div>
                  <h2>职责排名</h2>
                  <p>{isWingerExperiment ? "按照位置记录为主、左右路传中来源为佐证的活动侧判断，分别进入左边锋或右边锋榜单；活动侧仍不明确者单独列出。" : result.model.usesFootFilter ? "双脚与未知足侧进入待确认榜；足侧不明者不与确认榜混排。" : "榜单仅包含符合该职责位置池和当前出场门槛的球员。"}</p>
                </div>
                <div className="scout-search-ranking-controls">
                  <div className="scout-search-tabs">
                    {isWingerExperiment ? (
                      <>
                        <button className={activeList === "leftWing" ? "is-active" : ""} onClick={() => { setActiveList("leftWing"); setSelectedPlayerId(wingerSideGroups?.leftWing[0]?.id || ""); }}>
                          左边锋 ({wingerSideGroups?.leftWing.length || 0})
                        </button>
                        <button className={activeList === "rightWing" ? "is-active" : ""} onClick={() => { setActiveList("rightWing"); setSelectedPlayerId(wingerSideGroups?.rightWing[0]?.id || ""); }}>
                          右边锋 ({wingerSideGroups?.rightWing.length || 0})
                        </button>
                        {(wingerSideGroups?.sidePending.length || 0) > 0 ? (
                          <button className={activeList === "sidePending" ? "is-active" : ""} onClick={() => { setActiveList("sidePending"); setSelectedPlayerId(wingerSideGroups?.sidePending[0]?.id || ""); }}>
                            左右路待确认 ({wingerSideGroups?.sidePending.length || 0})
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <button className={activeList === "confirmed" ? "is-active" : ""} onClick={() => { setActiveList("confirmed"); setSelectedPlayerId(result.confirmed[0]?.id || ""); }}>
                          {result.model.confirmedLabel} ({result.confirmed.length})
                        </button>
                        {result.model.usesFootFilter ? (
                          <button className={activeList === "pending" ? "is-active" : ""} onClick={() => { setActiveList("pending"); setSelectedPlayerId(result.pending[0]?.id || ""); }}>
                            {result.model.pendingLabel} ({result.pending.length})
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                  {isRoleSimilarityExperiment ? (
                    <div className="scout-search-tabs scout-search-ranking-mode">
                      <button className={rankingMode === "ability" ? "is-active" : ""} onClick={() => setRankingMode("ability")}>能力排名</button>
                      <button className={rankingMode === "fit" ? "is-active" : ""} onClick={() => setRankingMode("fit")}>职责相似度</button>
                    </div>
                  ) : null}
                  <button className={`scout-search-hidden-toggle ${showHiddenPlayers ? "is-active" : ""}`} type="button" onClick={() => setShowHiddenPlayers((value) => !value)} disabled={hiddenRows.length === 0}>
                    {`已隐藏球员 (${hiddenRows.length})`}
                  </button>
                </div>
              </div>
              {showHiddenPlayers && hiddenRows.length > 0 ? (
                <div className="scout-search-hidden-panel">
                  <div className="scout-search-hidden-panel-head"><strong>已隐藏球员</strong><button type="button" onClick={() => setHiddenPlayerIds([])}>全部恢复</button></div>
                  <div className="scout-search-hidden-list">
                    {hiddenRows.map((player) => <button type="button" key={player.id} onClick={() => restorePlayer(player.id)}>{player.player}<span>恢复</span></button>)}
                  </div>
                </div>
              ) : null}
              <div className="scout-search-table-wrap">
                <table className="scout-search-ranking-table">
                  <colgroup>
                    <col className="ranking-col-rank" /><col className="ranking-col-player" /><col className="ranking-col-team" /><col className="ranking-col-position" /><col className="ranking-col-foot" /><col className="ranking-col-minutes" /><col className="ranking-col-average" />
                    {isRoleSimilarityExperiment ? <><col className="ranking-col-archetype" /><col className="ranking-col-fit" /><col className="ranking-col-confidence" /></> : null}
                    <col className="ranking-col-raw" />
                    <col className="ranking-col-reliability" /><col className="ranking-col-final" /><col className="ranking-col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>排名</th><th>球员</th><th>球队</th><th>位置</th><th>足侧</th><th>分钟</th><th>场均</th>
                      {isRoleSimilarityExperiment ? <><th>主要职责</th><th>当前职责相似度</th><th>数据可信度</th></> : null}
                      <th>{isRoleSimilarityExperiment ? "职责能力分" : "所选模块原始分"}</th>
                      <th>可靠度</th><th>所选模块最终分</th><th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((player) => (
                      <tr key={player.id} className={selectedPlayer?.id === player.id ? "is-selected" : ""} onClick={() => setSelectedPlayerId(player.id)}>
                        <td>{player.selectedRank}</td><td className="ranking-text-cell" title={player.player}><strong>{player.player}</strong></td><td className="ranking-text-cell" title={player.team || "-"}>{player.team || "-"}</td><td className="ranking-text-cell" title={player.position || "-"}>{player.position || "-"}</td><td>{player.foot || "未知"}</td>
                        <td>{formatNumber(player.minutes)}</td><td>{formatNumber(player.avgMinutes)}</td>
                        {isRoleSimilarityExperiment ? <><td className="ranking-text-cell" title={player.archetype?.label || "数据不足"}>{player.archetype?.label || "数据不足"}</td><td><span className="scout-search-score">{player.roleFitScore == null ? "-" : player.roleFitScore.toFixed(1)}</span></td><td>{player.archetype ? `${Math.round((player.archetype.dataConfidence ?? player.archetype.confidence) * 100)}%` : "-"}</td></> : null}
                        <td><span className={`scout-search-score ${scoreTone(player.selectedRawScore)}`}>{player.selectedRawScore.toFixed(1)}</span></td>
                        <td>{Math.round(player.reliability * 100)}%</td>
                        <td><span className={`scout-search-score ${scoreTone(player.selectedScore)}`}>{player.selectedScore.toFixed(1)}</span></td>
                        <td className="scout-search-row-actions">
                          <button type="button" className="is-hide" onClick={(event) => { event.stopPropagation(); hidePlayer(player.id); }}>隐藏</button>
                        </td>
                      </tr>
                    ))}
                    {activeRows.length === 0 ? <tr><td colSpan={isRoleSimilarityExperiment ? 14 : 11}>当前榜单没有可见球员，可从“已隐藏球员”中恢复。</td></tr> : null}
                  </tbody>
                </table>
              </div>
              {activeRows.length > 0 ? (
                <nav className="scout-search-pagination" aria-label="职责排名分页">
                  <button type="button" onClick={() => changeRankingPage(rankingPage - 1)} disabled={rankingPage <= 1}>上一页</button>
                  <div className="scout-search-page-numbers">
                    {Array.from({ length: rankingPageCount }, (_, index) => index + 1).map((page) => (
                      <button type="button" key={page} className={page === rankingPage ? "is-active" : ""} onClick={() => changeRankingPage(page)}>{page}</button>
                    ))}
                  </div>
                  <button type="button" onClick={() => changeRankingPage(rankingPage + 1)} disabled={rankingPage >= rankingPageCount}>下一页</button>
                  <span>{`第 ${rankingPage} / ${rankingPageCount} 页 · 共 ${activeRows.length} 人`}</span>
                </nav>
              ) : null}
            </section>

            {selectedPlayer ? (
              <section className="scout-search-detail">
                <header>
                  <div><h2>{selectedPlayer.player}</h2><p>{`${selectedPlayer.team || "-"} · ${selectedPlayer.position || "-"} · ${selectedPlayer.minutes} 分钟`}</p></div>
                  <div className="scout-search-detail-score-stack">
                    {isRoleSimilarityExperiment ? <div className="scout-search-total"><span>职责能力分</span><strong>{selectedPlayer.selectedRawScore.toFixed(1)}</strong></div> : null}
                    <div className={`scout-search-total ${scoreTone(selectedPlayer.selectedScore)}`}><span>所选模块最终分</span><strong>{selectedPlayer.selectedScore.toFixed(1)}</strong></div>
                  </div>
                </header>
                {isRoleSimilarityExperiment && selectedPlayer.archetype ? (
                  <section className="scout-search-archetype">
                    <div className="scout-search-archetype-head">
                      <div className="scout-search-archetype-verdict">
                        <div className="scout-search-archetype-verdict-title">
                          <span>职责判断</span>
                          <em>{selectedPlayer.archetype.status === "clear" ? "主职责明确" : selectedPlayer.archetype.status === "leaning" ? "主职责暂定" : selectedPlayer.archetype.status === "uncertain" ? "复合职责" : "数据不足"}</em>
                        </div>
                        <div className="scout-search-archetype-roles">
                          <div className="scout-search-archetype-primary-role">
                            <small>主要职责</small>
                            <strong>{selectedPlayer.archetype.label}</strong>
                          </div>
                          <i aria-hidden="true" />
                          <div className="scout-search-archetype-secondary-role">
                            <small>次要职责</small>
                            <b>{selectedPlayer.archetype.secondaryName || "暂无"}</b>
                          </div>
                        </div>
                        <div className="scout-search-archetype-verdict-meta">
                          <span><small>位置依据</small><b>{selectedPlayer.archetype.positionContext}</b></span>
                        </div>
                      </div>
                      <div className="scout-search-archetype-stat">
                        <span>数据可信度</span>
                        <strong>{Math.round((selectedPlayer.archetype.dataConfidence ?? selectedPlayer.archetype.confidence) * 100)}%</strong>
                        <small>{`字段 ${Math.round(selectedPlayer.archetype.coverage * 100)}% · 分钟 ${Math.round(selectedPlayer.archetype.minuteReliability * 100)}% · 位置 ${Math.round(selectedPlayer.archetype.positionReliability * 100)}%`}</small>
                      </div>
                      <div className="scout-search-archetype-stat">
                        <span>职责区分度</span>
                        <strong>{`${Math.round((selectedPlayer.archetype.roleClarity ?? selectedPlayer.archetype.decisionStrength) * 100)}%`}</strong>
                        <small>{`第一与第二相似度差 ${selectedPlayer.archetype.margin.toFixed(1)} · 相对差 ${Math.round(selectedPlayer.archetype.relativeSeparation * 100)}%`}</small>
                      </div>
                    </div>
                    {isForwardExperiment && selectedPlayer.archetype.completeForwardGate && !selectedPlayer.archetype.completeForwardGate.eligible ? <p className="scout-search-archetype-note"><b>全能型未通过准入</b><span>{selectedPlayer.archetype.completeForwardGate.reasons.join("；")}</span></p> : null}
                    {isForwardExperiment && selectedPlayer.archetype.primaryRoleId === "complete_forward" ? <p className="scout-search-archetype-note"><b>全能型说明</b><span>五类核心行为已全部达到准入门槛；具体完成质量请结合职责能力分。</span></p> : null}
                    <div className="scout-search-fit-grid">
                      {selectedPlayer.archetype.fits.map((fit) => <article key={fit.roleId} className={fit.eligible ? "" : "is-ineligible"}><span>{fit.name}</span><strong>{fit.score.toFixed(1)}</strong><small>{fit.eligible ? `独立职责相似度 · 覆盖 ${Math.round(fit.evidenceCoverage * 100)}%` : fit.eligibilityReason}</small><div className="scout-search-bar"><i style={{ width: `${Math.max(0, Math.min(100, fit.score))}%` }} /></div></article>)}
                    </div>
                    <div className="scout-search-pillar-grid">
                      {selectedPlayer.archetype.pillars.map((pillar) => <article key={pillar.id}><span>{pillar.name}</span><strong>{pillar.score == null ? "缺失" : pillar.score.toFixed(1)}</strong><small>{`覆盖 ${Math.round(pillar.coverage * 100)}%`}</small></article>)}
                    </div>
                  </section>
                ) : null}
                <div className="scout-search-dimension-grid">
                  {selectedPlayer.dimensions.filter((dimension) => selectedDimensionIds.includes(dimension.id)).map((dimension) => (
                    <article key={dimension.id}>
                      <div><span>{dimension.name}</span><strong>{dimension.score.toFixed(1)}</strong></div>
                      <div className="scout-search-bar"><i style={{ width: `${Math.max(0, Math.min(100, dimension.score))}%` }} /></div>
                      <small>{`完整度 ${Math.round(dimension.completeness * 100)}% · 权重 ${dimension.weight}%`}</small>
                    </article>
                  ))}
                </div>
                <div className="scout-search-table-wrap scout-search-metric-table">
                  <table>
                    <colgroup><col className="metric-col-dimension" /><col className="metric-col-name" /><col className="metric-col-value" /><col className="metric-col-percentile" /><col className="metric-col-weight" /><col className="metric-col-contribution" /></colgroup>
                    <thead><tr><th>维度</th><th>指标</th><th>原值</th><th>指标计分</th><th>权重</th><th>可靠度后贡献</th></tr></thead>
                    <tbody>
                      {selectedDisplayMetrics.map((metric, index, visibleMetrics) => {
                        const isGroupStart = index === 0 || visibleMetrics[index - 1].dimensionName !== metric.dimensionName;
                        const dimensionRowCount = visibleMetrics.filter((item) => item.dimensionName === metric.dimensionName).length;
                        const rowClasses = [isGroupStart ? "is-group-start" : "", metric.available ? "" : "is-missing"].filter(Boolean).join(" ");
                        const contribution = selectedMetricContribution(metric, selectedDimensionWeight, selectedPlayer.reliability);
                        return (
                        <tr key={`${metric.dimensionName}-${metric.column}`} className={rowClasses}>
                          {isGroupStart ? <td rowSpan={dimensionRowCount} className="metric-dimension-cell"><span>{metric.dimensionName}</span></td> : null}
                          <td className="metric-name-cell" title={[metric.note, metric.coupledFormula].filter(Boolean).join("；") || undefined}>{displayedMetricLabel(metric)}{metric.members.length > 1 ? <small className="metric-coupled-label">量效耦合指标</small> : null}</td>
                          <td className="metric-value-cell">{metric.available ? (
                            metric.members.length > 1 ? <span className="metric-source-values">{metric.members.map((member) => <small key={member.column}>{`${displayedMetricLabel(member)} ${formatNumber(member.rawValue)}`}</small>)}</span> : formatNumber(metric.rawValue)
                          ) : "缺失"}</td>
                          <td className="metric-percentile-cell">
                            {metric.available ? (
                              <span className="scout-search-percentile-stack" title={`${metric.coupledFormula || metric.smoothingReason}；标准排名百分位 ${metric.rawPercentile.toFixed(1)}${metric.coupledComponents ? `；调整成功率 ${metric.coupledComponents.adjustedRate.toFixed(1)}%；调整成功次数/90 ${metric.coupledComponents.successfulPer90.toFixed(2)}` : ""}`}>
                                <span className="scout-search-percentile" style={percentileStyle(metric.percentile)}>{metric.percentile.toFixed(1)}</span>
                                <small>{`标准 ${metric.rawPercentile.toFixed(1)}`}</small>
                                {(metric.eliteMetricBonus ?? 0) > 0 ? <small className="metric-elite-detail">{`尖点 +${metric.eliteMetricBonus!.toFixed(1)} · 计分 ${(metric.scoringPercentile ?? metric.percentile).toFixed(1)}`}</small> : null}
                              </span>
                            ) : <span className="metric-neutral">50.0 · 中性</span>}
                          </td><td className="metric-weight-cell">{metric.weight}%</td><td className="metric-contribution-cell"><span className={`metric-contribution ${contribution > 0 ? "is-positive" : contribution < 0 ? "is-negative" : ""}`}>{contribution > 0 ? "+" : ""}{contribution.toFixed(2)}</span></td>
                        </tr>
                      );})}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5}>贡献闭环合计（最终分 = 50 + 合计）</td>
                        <td className="metric-contribution-cell">
                          <span className={`metric-contribution ${selectedContributionTotal > 0 ? "is-positive" : selectedContributionTotal < 0 ? "is-negative" : ""}`}>
                            {selectedContributionTotal > 0 ? "+" : ""}{selectedContributionTotal.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <section className="scout-search-empty">
            <h2>等待运行模型</h2>
            <p>选择数据集后点击“运行职责模型”。建议先用你提供的右边锋样例表验证排名和指标贡献。</p>
          </section>
        )}
      </div>
    </section>
  );
}

export default ScoutSearchPage;
