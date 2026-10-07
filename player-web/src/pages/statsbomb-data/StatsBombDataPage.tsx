import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchStatsBombClassicDatasets,
  fetchStatsBombClassicPlayerStats,
  fetchStatsBombCompetitions,
  fetchStatsBombLeagueTable,
  fetchStatsBombPlayerSeasonStats,
  fetchStatsBombStatus,
  importStatsBombClassicCsv,
  testStatsBombConnection
} from "../../api/storageClient";

type StatsBombStatus = {
  configured: boolean;
  missingEnvironmentVariables: string[];
  maskedUsername: string;
  packageAvailable: boolean;
  packageVersion: string | null;
  mode: string;
};

type CompetitionSeason = {
  competitionId: number;
  seasonId: number;
  countryName: string;
  competitionName: string;
  seasonName: string;
  gender: string;
  matchAvailable: string;
  matchUpdated: string;
  matchAvailable360: string;
};

type StatsBombMatch = {
  matchId: number;
  matchDate: string;
  kickOff: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  matchStatus: string;
  collectionStatus: string;
  lastUpdated: string;
};

type LeagueRow = {
  rank: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  xGFor: number | null;
  xGAgainst: number | null;
  xGDifference: number | null;
  shotsFor: number | null;
  shotsAgainst: number | null;
};

type TeamSeasonStat = {
  teamId: number | null;
  teamName: string;
  xGFor: number | null;
  xGAgainst: number | null;
  shotsFor: number | null;
  shotsAgainst: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  passes: number | null;
  pressures: number | null;
};

type PlayerSeasonStat = {
  playerId: number | null;
  playerName: string;
  teamName: string;
  minutes: number | null;
  appearances: number | null;
  goals: number | null;
  assists: number | null;
  xG: number | null;
  xA: number | null;
  shots: number | null;
  obv: number | null;
};

type ClassicDatasetSummary = {
  id: string;
  name: string;
  sourceFile: string;
  updatedAt: string;
  rowCount: number;
  columnCount: number;
  competitions: string[];
  seasons: string[];
};

type ClassicColumn = {
  key: string;
  label: string;
  group: string;
  kind: "text" | "number" | "percent";
  nonEmptyCount: number;
};

type ClassicGroup = { id: string; label: string; columnCount: number };

type ClassicPlayerStatsData = {
  datasetId: string;
  updatedAt: string;
  sourceFile: string;
  rowCount: number;
  columnCount: number;
  excludedColumns: string[];
  columns: ClassicColumn[];
  groups: ClassicGroup[];
  filters: { competitions: string[]; seasons: string[]; teams: string[]; positions: string[] };
  rows: Array<Record<string, string>>;
};

type SectionId =
  | "overview" | "match-dashboard" | "match-stats" | "xg-race" | "shot-map"
  | "pass-network" | "pressure-map" | "formations" | "league-table" | "fixtures"
  | "team-stats" | "team-comparison" | "player-stats" | "event-filter" | "multi-pitch"
  | "possessions" | "obv-chain" | "freeze-frame" | "visible-area" | "defensive-shape"
  | "passing-lanes" | "set-pieces" | "field-tilt" | "attack-direction" | "xpass"
  | "gk-suppression" | "hops" | "defr";

type NavGroup = { label: string; items: Array<{ id: SectionId; label: string }> };

const NAV_GROUPS: NavGroup[] = [
  { label: "总览", items: [{ id: "overview", label: "接入状态" }] },
  { label: "比赛中心", items: [
    { id: "match-dashboard", label: "比赛仪表盘" }, { id: "match-stats", label: "比赛统计" },
    { id: "xg-race", label: "xG Race" }, { id: "shot-map", label: "射门图" },
    { id: "pass-network", label: "传球网络" }, { id: "pressure-map", label: "压迫热图" },
    { id: "formations", label: "阵型与换人" }
  ] },
  { label: "联赛中心", items: [
    { id: "league-table", label: "League Table" }, { id: "fixtures", label: "Fixtures" },
    { id: "team-stats", label: "Team Stats" }, { id: "team-comparison", label: "Team Comparison" },
    { id: "player-stats", label: "Player Stats" }
  ] },
  { label: "事件分析", items: [
    { id: "event-filter", label: "事件筛选器" }, { id: "multi-pitch", label: "多球场事件画板" },
    { id: "possessions", label: "进攻回合" }, { id: "obv-chain", label: "OBV 事件链" }
  ] },
  { label: "360 分析", items: [
    { id: "freeze-frame", label: "Freeze Frame" }, { id: "visible-area", label: "可见区域" },
    { id: "defensive-shape", label: "防守结构" }, { id: "passing-lanes", label: "传球线路" }
  ] },
  { label: "专题分析", items: [
    { id: "set-pieces", label: "角球与定位球" }, { id: "field-tilt", label: "Field Tilt" },
    { id: "attack-direction", label: "进攻方向" }, { id: "xpass", label: "xPass" },
    { id: "gk-suppression", label: "门将 xG Suppression" }, { id: "hops", label: "HOPS 空中能力" },
    { id: "defr", label: "DefR 防守责任" }
  ] }
];

const IMPLEMENTED_SECTIONS = new Set<SectionId>([
  "overview", "match-dashboard", "league-table", "fixtures", "team-stats", "team-comparison", "player-stats", "gk-suppression"
]);

const EMPTY_STATUS: StatsBombStatus = {
  configured: false,
  missingEnvironmentVariables: [],
  maskedUsername: "",
  packageAvailable: false,
  packageVersion: null,
  mode: "commercial-api"
};

function competitionKey(item: CompetitionSeason) {
  return `${item.competitionId}:${item.seasonId}`;
}

function matchScore(item: StatsBombMatch) {
  if (item.homeScore === null || item.awayScore === null) return "–";
  return `${item.homeScore} - ${item.awayScore}`;
}

function metric(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "–";
  return Number(value).toFixed(digits).replace(/\.00$/, "");
}

function sectionLabel(section: SectionId) {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((candidate) => candidate.id === section);
    if (item) return item.label;
  }
  return section;
}

function StatsBombDataPage() {
  const [status, setStatus] = useState<StatsBombStatus>(EMPTY_STATUS);
  const [statusLoading, setStatusLoading] = useState(true);
  const [connectionState, setConnectionState] = useState<"idle" | "testing" | "connected">("idle");
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [competitions, setCompetitions] = useState<CompetitionSeason[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [matches, setMatches] = useState<StatsBombMatch[]>([]);
  const [leagueRows, setLeagueRows] = useState<LeagueRow[]>([]);
  const [teamStats, setTeamStats] = useState<TeamSeasonStat[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerSeasonStat[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [comparisonA, setComparisonA] = useState("");
  const [comparisonB, setComparisonB] = useState("");
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [seasonLoaded, setSeasonLoaded] = useState(false);
  const [includedMatchCount, setIncludedMatchCount] = useState(0);
  const [totalMatchCount, setTotalMatchCount] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [classicDatasets, setClassicDatasets] = useState<ClassicDatasetSummary[]>([]);
  const [selectedClassicDatasetId, setSelectedClassicDatasetId] = useState("");
  const [classicData, setClassicData] = useState<ClassicPlayerStatsData | null>(null);
  const [classicLoading, setClassicLoading] = useState(false);
  const [classicGroup, setClassicGroup] = useState("goalkeeping");
  const [classicTeam, setClassicTeam] = useState("");
  const [classicSeason, setClassicSeason] = useState("");
  const [classicSearch, setClassicSearch] = useState("");
  const [showEmptyClassicColumns, setShowEmptyClassicColumns] = useState(false);
  const classicFileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCompetition = useMemo(
    () => competitions.find((item) => competitionKey(item) === selectedKey) || null,
    [competitions, selectedKey]
  );
  const selectedMatch = useMemo(
    () => matches.find((item) => String(item.matchId) === selectedMatchId) || matches[0] || null,
    [matches, selectedMatchId]
  );
  const teamA = useMemo(() => teamStats.find((item) => item.teamName === comparisonA) || null, [teamStats, comparisonA]);
  const teamB = useMemo(() => teamStats.find((item) => item.teamName === comparisonB) || null, [teamStats, comparisonB]);
  const classicMetricColumns = useMemo(() => {
    if (!classicData) return [];
    const fixed = new Set(["Name", "Player Name", "Team", "Season", "Seasons", "Minutes Played", "Primary Position"]);
    return classicData.columns.filter((column) => column.group === classicGroup && !fixed.has(column.key) && (showEmptyClassicColumns || column.nonEmptyCount > 0));
  }, [classicData, classicGroup, showEmptyClassicColumns]);
  const filteredClassicRows = useMemo(() => {
    if (!classicData) return [];
    const search = classicSearch.trim().toLocaleLowerCase();
    return classicData.rows.filter((row) => {
      const name = row["Player Name"] || row.Name || "";
      const season = row.Season || row.Seasons || "";
      if (classicTeam && row.Team !== classicTeam) return false;
      if (classicSeason && season !== classicSeason) return false;
      if (search && !name.toLocaleLowerCase().includes(search) && !String(row.Team || "").toLocaleLowerCase().includes(search)) return false;
      return true;
    });
  }, [classicData, classicSearch, classicSeason, classicTeam]);

  useEffect(() => {
    let cancelled = false;
    setStatusLoading(true);
    fetchStatsBombStatus()
      .then((response: StatsBombStatus) => {
        if (!cancelled) setStatus({ ...EMPTY_STATUS, ...response });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(`状态读取失败：${err.message}`);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchStatsBombClassicDatasets()
      .then(async (response: any) => {
        if (cancelled) return;
        const datasets = Array.isArray(response.datasets) ? (response.datasets as ClassicDatasetSummary[]) : [];
        const datasetId = String(response.selectedDatasetId || datasets[0]?.id || "");
        setClassicDatasets(datasets);
        setSelectedClassicDatasetId(datasetId);
        if (!datasetId) return;
        const detail = await fetchStatsBombClassicPlayerStats(datasetId);
        if (!cancelled) setClassicData((detail.data || null) as ClassicPlayerStatsData | null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(`StatsBomb CSV 数据读取失败：${err.message}`);
      });
    return () => { cancelled = true; };
  }, []);

  const resetSeasonData = () => {
    setMatches([]);
    setLeagueRows([]);
    setTeamStats([]);
    setPlayerStats([]);
    setSelectedMatchId("");
    setComparisonA("");
    setComparisonB("");
    setIncludedMatchCount(0);
    setTotalMatchCount(0);
    setSeasonLoaded(false);
  };

  const loadCompetitions = async () => {
    const response = await fetchStatsBombCompetitions();
    const items = Array.isArray(response.competitions) ? (response.competitions as CompetitionSeason[]) : [];
    setCompetitions(items);
    resetSeasonData();
    setSelectedKey((current) => {
      if (current && items.some((item) => competitionKey(item) === current)) return current;
      return items.length > 0 ? competitionKey(items[0]) : "";
    });
    return items;
  };

  const handleTestConnection = async () => {
    setConnectionState("testing");
    setMessage("");
    setError("");
    try {
      const result = await testStatsBombConnection();
      const items = await loadCompetitions();
      setConnectionState("connected");
      setMessage(`连接成功：账号可读取 ${Number(result.competitionSeasonCount || items.length)} 个赛事赛季。`);
    } catch (err: any) {
      setConnectionState("idle");
      setError(`连接失败：${err.message}`);
    }
  };

  const handleLoadSeason = async () => {
    if (!selectedCompetition) return;
    setSeasonLoading(true);
    setMessage("");
    setError("");
    try {
      const result = await fetchStatsBombLeagueTable(selectedCompetition.competitionId, selectedCompetition.seasonId);
      const nextMatches = Array.isArray(result.matches) ? (result.matches as StatsBombMatch[]) : [];
      const nextRows = Array.isArray(result.rows) ? (result.rows as LeagueRow[]) : [];
      const nextTeamStats = Array.isArray(result.teamStats) ? (result.teamStats as TeamSeasonStat[]) : [];
      setMatches(nextMatches);
      setLeagueRows(nextRows);
      setTeamStats(nextTeamStats);
      setPlayerStats([]);
      setSelectedMatchId(nextMatches[0] ? String(nextMatches[0].matchId) : "");
      setComparisonA(nextTeamStats[0]?.teamName || "");
      setComparisonB(nextTeamStats[1]?.teamName || nextTeamStats[0]?.teamName || "");
      setIncludedMatchCount(Number(result.includedMatchCount || 0));
      setTotalMatchCount(Number(result.totalMatchCount || nextMatches.length));
      setSeasonLoaded(true);
      const warning = String(result.warning || "");
      setMessage(`${selectedCompetition.competitionName} ${selectedCompetition.seasonName} 已读取：${nextMatches.length} 场比赛、${nextRows.length} 支球队。${warning ? ` ${warning}` : ""}`);
    } catch (err: any) {
      resetSeasonData();
      setError(`赛季数据读取失败：${err.message}`);
    } finally {
      setSeasonLoading(false);
    }
  };

  const handleLoadPlayers = async () => {
    if (!selectedCompetition) return;
    setPlayersLoading(true);
    setError("");
    try {
      const result = await fetchStatsBombPlayerSeasonStats(selectedCompetition.competitionId, selectedCompetition.seasonId);
      const players = Array.isArray(result.players) ? (result.players as PlayerSeasonStat[]) : [];
      setPlayerStats(players);
      setMessage(`已读取 ${players.length} 条球员赛季统计。`);
    } catch (err: any) {
      setPlayerStats([]);
      setError(`球员统计读取失败：${err.message}`);
    } finally {
      setPlayersLoading(false);
    }
  };

  const loadClassicDataset = async (datasetId: string) => {
    setSelectedClassicDatasetId(datasetId);
    setClassicLoading(true);
    setError("");
    try {
      const result = await fetchStatsBombClassicPlayerStats(datasetId);
      const data = (result.data || null) as ClassicPlayerStatsData | null;
      setClassicData(data);
      setClassicTeam("");
      setClassicSeason("");
      setClassicSearch("");
      const preferredGroup = data?.groups.some((group) => group.id === "goalkeeping") ? "goalkeeping" : data?.groups[0]?.id || "profile";
      setClassicGroup(preferredGroup);
    } catch (err: any) {
      setClassicData(null);
      setError(`StatsBomb CSV 数据读取失败：${err.message}`);
    } finally {
      setClassicLoading(false);
    }
  };

  const handleClassicImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setClassicLoading(true);
    setMessage("");
    setError("");
    try {
      const result = await importStatsBombClassicCsv(file);
      const response = await fetchStatsBombClassicDatasets();
      const datasets = Array.isArray(response.datasets) ? (response.datasets as ClassicDatasetSummary[]) : [];
      const datasetId = String(result.dataset?.id || response.selectedDatasetId || "");
      const data = (result.data || null) as ClassicPlayerStatsData | null;
      setClassicDatasets(datasets);
      setSelectedClassicDatasetId(datasetId);
      setClassicData(data);
      setClassicTeam("");
      setClassicSeason("");
      setClassicSearch("");
      setClassicGroup(data?.groups.some((group) => group.id === "goalkeeping") ? "goalkeeping" : data?.groups[0]?.id || "profile");
      setActiveSection("player-stats");
      setMessage(`已导入 ${Number(data?.rowCount || 0)} 条 StatsBomb Scout 记录、${Number(data?.columnCount || 0)} 个分析字段。`);
    } catch (err: any) {
      setError(`StatsBomb CSV 导入失败：${err.message}`);
    } finally {
      setClassicLoading(false);
    }
  };

  const ready = status.configured && status.packageAvailable;

  const renderOverview = () => (
    <div className="statsbomb-content-stack">
      <div className="statsbomb-status-grid">
        <article className="statsbomb-status-card"><span>服务器凭据</span><strong>{statusLoading ? "检查中" : status.configured ? "已配置" : "未配置"}</strong><small>{status.maskedUsername || "账号不会显示或保存到浏览器"}</small></article>
        <article className="statsbomb-status-card"><span>Python 接入库</span><strong>{statusLoading ? "检查中" : status.packageAvailable ? "已安装" : "未安装"}</strong><small>{status.packageVersion ? `statsbombpy ${status.packageVersion}` : "需要安装 statsbombpy"}</small></article>
        <article className="statsbomb-status-card"><span>Classic Scout CSV</span><strong>{classicData ? "已导入" : "可用"}</strong><small>{classicData ? `${classicData.rowCount} 条记录 · ${classicData.columnCount} 个字段` : "无需商业 API Basic Auth"}</small></article>
        <article className="statsbomb-status-card"><span>隔离模式</span><strong>只读分析</strong><small>不写入现有球员、比赛或雷达图数据集</small></article>
      </div>
      {!statusLoading && !status.configured ? <div className="statsbomb-setup-note"><strong>真实数据验证需要在后端服务器配置账号</strong><p>{`缺少：${status.missingEnvironmentVariables.join("、") || "SB_USERNAME、SB_PASSWORD"}`}</p><p>页面不提供密码输入框，凭据不会进入浏览器或仓库。</p></div> : null}
      <div className="statsbomb-classic-import">
        <div><strong>从 StatsBomb Classic 导入 Scout Results CSV</strong><p>支持球员统计、门将、OBV 与 360 派生指标。逐事件坐标和 Freeze Frame 仍需事件/360 数据。</p></div>
        <button type="button" onClick={() => classicFileInputRef.current?.click()} disabled={classicLoading}>{classicLoading ? "处理中..." : classicData ? "导入另一份 CSV" : "选择 CSV"}</button>
      </div>
      <div className="statsbomb-module-grid">
        {NAV_GROUPS.slice(1).map((group) => <article key={group.label} className="statsbomb-module-card"><span>{group.label}</span><strong>{group.items.length} 个模块</strong><p>{group.items.map((item) => item.label).join(" · ")}</p></article>)}
      </div>
    </div>
  );

  const renderLeagueTable = () => (
    <div className="statsbomb-table-card">
      <div className="statsbomb-table-title"><div><h2>StatsBomb 覆盖积分表</h2><p>仅统计 match_status=available 且比分完整的比赛；不包含官方扣分、纪律或其他外部修正。</p></div><span>{includedMatchCount}/{totalMatchCount} 场计入</span></div>
      <div className="player-data-table-wrap statsbomb-table-wrap">
        <table className="player-data-table statsbomb-data-table statsbomb-league-table"><thead><tr><th>排名</th><th>球队</th><th>积分</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>进/失</th><th>净胜球</th><th>xG</th><th>xGC</th><th>xGD</th><th>射门</th><th>被射门</th></tr></thead>
          <tbody>{leagueRows.map((row) => <tr key={row.teamName}><td>{row.rank}</td><td><strong>{row.teamName}</strong></td><td><strong>{row.points}</strong></td><td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td>{row.goalsFor}/{row.goalsAgainst}</td><td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td><td>{metric(row.xGFor)}</td><td>{metric(row.xGAgainst)}</td><td>{metric(row.xGDifference)}</td><td>{metric(row.shotsFor)}</td><td>{metric(row.shotsAgainst)}</td></tr>)}</tbody>
        </table>
        {!seasonLoaded ? <p className="fitness-empty">连接账号并读取赛季后显示 StatsBomb 覆盖积分表。</p> : null}
      </div>
    </div>
  );

  const renderFixtures = () => (
    <div className="statsbomb-table-card">
      <div className="statsbomb-table-title"><div><h2>Fixtures</h2><p>授权赛季的比赛目录与采集状态。</p></div><span>{matches.length} 场</span></div>
      <div className="player-data-table-wrap statsbomb-table-wrap"><table className="player-data-table statsbomb-data-table"><thead><tr><th>日期</th><th>时间</th><th>主队</th><th>比分</th><th>客队</th><th>比赛 ID</th><th>状态</th></tr></thead><tbody>{matches.map((item) => <tr key={item.matchId}><td>{item.matchDate || "–"}</td><td>{item.kickOff || "–"}</td><td>{item.homeTeam || "–"}</td><td>{matchScore(item)}</td><td>{item.awayTeam || "–"}</td><td>{item.matchId}</td><td>{item.collectionStatus || item.matchStatus || "–"}</td></tr>)}</tbody></table>{!seasonLoaded ? <p className="fitness-empty">读取赛季后显示赛程。</p> : null}</div>
    </div>
  );

  const renderTeamStats = () => (
    <div className="statsbomb-table-card">
      <div className="statsbomb-table-title"><div><h2>Team Stats</h2><p>直接来自 StatsBomb team_season_stats；缺少的订阅字段显示“–”。</p></div><span>{teamStats.length} 支球队</span></div>
      <div className="player-data-table-wrap statsbomb-table-wrap"><table className="player-data-table statsbomb-data-table"><thead><tr><th>球队</th><th>xG</th><th>xG Against</th><th>Shots</th><th>Shots Against</th><th>Goals</th><th>Goals Against</th><th>Passes</th><th>Pressures</th></tr></thead><tbody>{teamStats.map((row) => <tr key={row.teamName}><td><strong>{row.teamName}</strong></td><td>{metric(row.xGFor)}</td><td>{metric(row.xGAgainst)}</td><td>{metric(row.shotsFor)}</td><td>{metric(row.shotsAgainst)}</td><td>{metric(row.goalsFor)}</td><td>{metric(row.goalsAgainst)}</td><td>{metric(row.passes)}</td><td>{metric(row.pressures)}</td></tr>)}</tbody></table>{seasonLoaded && teamStats.length === 0 ? <p className="fitness-empty">当前账号或赛季未返回球队聚合统计，比赛与积分表仍可使用。</p> : null}</div>
    </div>
  );

  const renderTeamComparison = () => {
    const fields: Array<[keyof TeamSeasonStat, string]> = [["xGFor", "xG"], ["xGAgainst", "xG Against"], ["shotsFor", "Shots"], ["shotsAgainst", "Shots Against"], ["goalsFor", "Goals"], ["goalsAgainst", "Goals Against"], ["passes", "Passes"], ["pressures", "Pressures"]];
    return <div className="statsbomb-table-card"><div className="statsbomb-table-title"><div><h2>Team Comparison</h2><p>并排比较 StatsBomb 聚合统计原值，不做二次估算。</p></div></div><div className="statsbomb-compare-selects"><select value={comparisonA} onChange={(event) => setComparisonA(event.target.value)}>{teamStats.map((team) => <option key={team.teamName} value={team.teamName}>{team.teamName}</option>)}</select><span>VS</span><select value={comparisonB} onChange={(event) => setComparisonB(event.target.value)}>{teamStats.map((team) => <option key={team.teamName} value={team.teamName}>{team.teamName}</option>)}</select></div><div className="statsbomb-compare-grid">{fields.map(([key, label]) => <div key={String(key)} className="statsbomb-compare-row"><strong>{metric(teamA?.[key] as number | null)}</strong><span>{label}</span><strong>{metric(teamB?.[key] as number | null)}</strong></div>)}</div>{teamStats.length === 0 ? <p className="fitness-empty">读取含球队聚合统计的赛季后可进行比较。</p> : null}</div>;
  };

  const renderPlayerStats = () => (
    <div className="statsbomb-content-stack">
      <div className="statsbomb-table-card">
        <div className="statsbomb-table-title">
          <div><h2>Classic Scout Player Stats</h2><p>保留 CSV 原始字段和值；Account 字段因包含账号信息而不保存、不展示。</p></div>
          <button type="button" onClick={() => classicFileInputRef.current?.click()} disabled={classicLoading}>{classicLoading ? "处理中..." : classicData ? "重新导入" : "导入 CSV"}</button>
        </div>
        {classicDatasets.length ? <div className="statsbomb-classic-dataset-row"><label>数据集</label><select value={selectedClassicDatasetId} onChange={(event) => loadClassicDataset(event.target.value)}>{classicDatasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.sourceFile} · {dataset.rowCount} 条 · {dataset.updatedAt.slice(0, 10)}</option>)}</select></div> : null}
        {classicData ? <>
          <div className="statsbomb-classic-controls">
            <label><span>指标组</span><select value={classicGroup} onChange={(event) => setClassicGroup(event.target.value)}>{classicData.groups.map((group) => <option key={group.id} value={group.id}>{group.label} ({group.columnCount})</option>)}</select></label>
            <label><span>赛季</span><select value={classicSeason} onChange={(event) => setClassicSeason(event.target.value)}><option value="">全部赛季</option>{classicData.filters.seasons.map((season) => <option key={season} value={season}>{season}</option>)}</select></label>
            <label><span>球队</span><select value={classicTeam} onChange={(event) => setClassicTeam(event.target.value)}><option value="">全部球队</option>{classicData.filters.teams.map((team) => <option key={team} value={team}>{team}</option>)}</select></label>
            <label><span>搜索</span><input value={classicSearch} onChange={(event) => setClassicSearch(event.target.value)} placeholder="球员或球队" /></label>
            <label className="statsbomb-classic-check"><input type="checkbox" checked={showEmptyClassicColumns} onChange={(event) => setShowEmptyClassicColumns(event.target.checked)} /><span>显示全空字段</span></label>
          </div>
          <div className="statsbomb-table-note"><strong>{filteredClassicRows.length}</strong> 条记录 · 当前显示 <strong>{classicMetricColumns.length}</strong> 个“{classicData.groups.find((group) => group.id === classicGroup)?.label || classicGroup}”字段</div>
          <div className="player-data-table-wrap statsbomb-table-wrap statsbomb-classic-table-wrap"><table className="player-data-table statsbomb-data-table statsbomb-classic-table"><thead><tr><th>球员</th><th>球队</th><th>赛季</th><th>位置</th><th>分钟</th>{classicMetricColumns.map((column) => <th key={column.key} title={column.key}>{column.label}</th>)}</tr></thead><tbody>{filteredClassicRows.map((row, index) => <tr key={`${row["Player Id"] || row["Player SBData Id"] || row["Player Name"] || row.Name}-${row.Season || row.Seasons}-${index}`}><td><strong>{row["Player Name"] || row.Name || "–"}</strong></td><td>{row.Team || "–"}</td><td>{row.Season || row.Seasons || "–"}</td><td>{row["Primary Position"] || "–"}</td><td>{row["Minutes Played"] || "–"}</td>{classicMetricColumns.map((column) => <td key={column.key}>{row[column.key] || "–"}</td>)}</tr>)}</tbody></table>{!filteredClassicRows.length ? <p className="fitness-empty">当前筛选没有记录。</p> : null}</div>
        </> : <p className="fitness-empty">请导入 StatsBomb Classic “Download all” 下载的 player-stats.csv。</p>}
      </div>
      <div className="statsbomb-table-card statsbomb-api-secondary">
        <div className="statsbomb-table-title"><div><h2>Commercial API Player Stats</h2><p>商业 API 可用后按赛季读取，不写入现有球员库。</p></div><button type="button" onClick={handleLoadPlayers} disabled={!seasonLoaded || playersLoading}>{playersLoading ? "读取中..." : playerStats.length ? "重新读取" : "读取 API 球员统计"}</button></div>
        <div className="player-data-table-wrap statsbomb-table-wrap"><table className="player-data-table statsbomb-data-table"><thead><tr><th>球员</th><th>球队</th><th>分钟</th><th>出场</th><th>进球</th><th>助攻</th><th>xG</th><th>xA</th><th>射门</th><th>OBV</th></tr></thead><tbody>{playerStats.map((row, index) => <tr key={`${row.playerId || row.playerName}-${index}`}><td><strong>{row.playerName}</strong></td><td>{row.teamName || "–"}</td><td>{metric(row.minutes, 0)}</td><td>{metric(row.appearances, 0)}</td><td>{metric(row.goals, 0)}</td><td>{metric(row.assists, 0)}</td><td>{metric(row.xG)}</td><td>{metric(row.xA)}</td><td>{metric(row.shots, 0)}</td><td>{metric(row.obv)}</td></tr>)}</tbody></table>{!playerStats.length && !playersLoading ? <p className="fitness-empty">商业 API 赛季加载后可读取；CSV 模式不依赖这里。</p> : null}</div>
      </div>
    </div>
  );

  const renderGoalkeeperSuppression = () => {
    const keys = ["PSxG Faced", "Goals Conceded", "Goals Saved Above Average", "Save%", "Shot Stopping%", "Expected Save%", "Shots Faced", "All Shots Faced"];
    const availableKeys = keys.filter((key) => classicData?.columns.some((column) => column.key === key && column.nonEmptyCount > 0));
    return <div className="statsbomb-table-card"><div className="statsbomb-table-title"><div><h2>门将 xG Suppression</h2><p>直接展示 Scout CSV 的门将原始指标，不重新计算或补齐缺失值。</p></div><span>{classicData ? `${filteredClassicRows.length} 条记录` : "等待 CSV"}</span></div>{classicData ? <div className="player-data-table-wrap statsbomb-table-wrap"><table className="player-data-table statsbomb-data-table"><thead><tr><th>球员</th><th>球队</th><th>赛季</th><th>分钟</th>{availableKeys.map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{filteredClassicRows.map((row, index) => <tr key={`${row["Player Id"] || row["Player Name"]}-${row.Season}-${index}`}><td><strong>{row["Player Name"] || row.Name || "–"}</strong></td><td>{row.Team || "–"}</td><td>{row.Season || row.Seasons || "–"}</td><td>{row["Minutes Played"] || "–"}</td>{availableKeys.map((key) => <td key={key}>{row[key] || "–"}</td>)}</tr>)}</tbody></table></div> : <p className="fitness-empty">先在 Player Stats 导入 StatsBomb Classic CSV。</p>}</div>;
  };

  const renderMatchDashboard = () => (
    <div className="statsbomb-content-stack">
      <div className="statsbomb-match-picker"><label>选择比赛</label><select value={selectedMatch ? String(selectedMatch.matchId) : ""} onChange={(event) => setSelectedMatchId(event.target.value)}>{matches.map((match) => <option key={match.matchId} value={match.matchId}>{match.matchDate} · {match.homeTeam} vs {match.awayTeam}</option>)}</select></div>
      {selectedMatch ? <div className="statsbomb-match-hero"><span>{selectedMatch.matchDate} {selectedMatch.kickOff}</span><div><strong>{selectedMatch.homeTeam}</strong><b>{matchScore(selectedMatch)}</b><strong>{selectedMatch.awayTeam}</strong></div><small>Match ID {selectedMatch.matchId} · {selectedMatch.collectionStatus || selectedMatch.matchStatus}</small></div> : <p className="fitness-empty">读取赛季后选择比赛。后续比赛统计、xG Race、射门图、传球网络和 360 页面都会沿用这里的比赛选择。</p>}
      <div className="statsbomb-dashboard-grid">{["比赛统计", "xG Race", "射门图", "传球网络", "压迫热图", "阵型与换人"].map((label) => <article key={label}><span>{label}</span><strong>{selectedMatch ? "数据入口已就绪" : "等待比赛"}</strong><small>下一阶段接入事件与阵容数据</small></article>)}</div>
    </div>
  );

  const renderPlanned = () => (
    <div className="statsbomb-planned"><span>StatsBomb 分析路线图</span><h2>{sectionLabel(activeSection)}</h2><p>该入口已纳入独立分析工作区。完成账号实测后，将按数据权限接入对应的事件、阵容或 360 数据，并保持与现有工作台完全隔离。</p><div><strong>不会使用示例值代替真实统计</strong><small>如果账号没有对应数据权限，页面会明确提示缺失，不会回退到其他数据源。</small></div></div>
  );

  const renderContent = () => {
    if (activeSection === "overview") return renderOverview();
    if (activeSection === "match-dashboard") return renderMatchDashboard();
    if (activeSection === "league-table") return renderLeagueTable();
    if (activeSection === "fixtures") return renderFixtures();
    if (activeSection === "team-stats") return renderTeamStats();
    if (activeSection === "team-comparison") return renderTeamComparison();
    if (activeSection === "player-stats") return renderPlayerStats();
    if (activeSection === "gk-suppression") return renderGoalkeeperSuppression();
    return renderPlanned();
  };

  return (
    <section className="info-page statsbomb-info-page">
      <div className="info-card statsbomb-page-shell">
        <input ref={classicFileInputRef} type="file" accept=".csv,text/csv" onChange={handleClassicImport} hidden />
        <header className="statsbomb-header"><div><p className="statsbomb-kicker">Classic CSV + Commercial API · Isolated Analytics</p><h1>StatsBomb 分析</h1><p>新增分析域，不改动现有工作台功能、数据集或统计口径。</p></div><span className={`statsbomb-state-badge ${connectionState === "connected" || classicData ? "is-connected" : ""}`}>{connectionState === "connected" ? "API 已连接" : classicData ? "CSV 已导入" : ready ? "等待验证" : "可导入 CSV"}</span></header>
        <div className="statsbomb-toolbar"><button type="button" onClick={handleTestConnection} disabled={!ready || connectionState === "testing"}>{connectionState === "testing" ? "正在连接..." : "连接并读取授权赛事"}</button><select value={selectedKey} onChange={(event) => { setSelectedKey(event.target.value); resetSeasonData(); }} disabled={competitions.length === 0}>{competitions.length === 0 ? <option value="">连接后选择赛事赛季</option> : null}{competitions.map((item) => <option key={competitionKey(item)} value={competitionKey(item)}>{[item.countryName, item.competitionName, item.seasonName].filter(Boolean).join(" · ")}</option>)}</select><button type="button" onClick={handleLoadSeason} disabled={!selectedCompetition || seasonLoading}>{seasonLoading ? "读取赛季中..." : "读取赛季数据"}</button></div>
        {message ? <p className="msg ok">{message}</p> : null}
        {error ? <p className="msg err">{error}</p> : null}
        <div className="statsbomb-workspace">
          <aside className="statsbomb-sidebar">{NAV_GROUPS.map((group) => <div key={group.label} className="statsbomb-nav-group"><strong>{group.label}</strong>{group.items.map((item) => <button key={item.id} type="button" className={activeSection === item.id ? "is-active" : ""} onClick={() => setActiveSection(item.id)}><span>{item.label}</span>{IMPLEMENTED_SECTIONS.has(item.id) ? null : <small>待接入</small>}</button>)}</div>)}</aside>
          <main className="statsbomb-main"><div className="statsbomb-section-heading"><div><span>{NAV_GROUPS.find((group) => group.items.some((item) => item.id === activeSection))?.label}</span><h2>{sectionLabel(activeSection)}</h2></div>{selectedCompetition ? <small>{selectedCompetition.competitionName} · {selectedCompetition.seasonName}</small> : null}</div>{renderContent()}</main>
        </div>
      </div>
    </section>
  );
}

export default StatsBombDataPage;
