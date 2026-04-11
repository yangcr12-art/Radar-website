export const DEFAULT_TIER_COLORS = {
  elite: "#0099FF",
  above_avg: "#16a34a",
  avg: "#f2b700",
  bottom: "#d32f2f"
};

export const TIER_LABELS = {
  elite: "顶级",
  above_avg: "良好",
  avg: "中等",
  bottom: "较弱"
};

export const TIER_ALIASES = {
  elite: "elite",
  顶级: "elite",
  above_avg: "above_avg",
  良好: "above_avg",
  avg: "avg",
  中等: "avg",
  bottom: "bottom",
  较弱: "bottom"
};

export const HEADER_ALIASES = {
  metric: "metric",
  指标: "metric",
  value: "value",
  百分比: "value",
  百分位: "value",
  group: "group",
  分组: "group",
  order: "order",
  顺序: "order",
  subOrder: "subOrder",
  groupOrder: "subOrder",
  intraOrder: "subOrder",
  组内顺序: "subOrder",
  组内排序: "subOrder",
  per90: "per90",
  每90: "per90",
  tier: "tier",
  层级: "tier",
  color: "color",
  颜色: "color"
};

export const INITIAL_ROWS = [
  { metric: "Long Pass %", group: "Passing", value: 71.43, per90: "", tier: "elite", order: 1, color: "" },
  { metric: "Cross + Smart Complete %", group: "Passing", value: 33.33, per90: "", tier: "above_avg", order: 1, color: "" },
  { metric: "Short & Med Pass %", group: "Passing", value: 76.72, per90: "", tier: "above_avg", order: 1, color: "" },
  { metric: "Aerial Win %", group: "Defending", value: 44.0, per90: "", tier: "elite", order: 2, color: "" },
  { metric: "Tackles + Int (PAdj)", group: "Defending", value: 57.0, per90: "2.57", tier: "above_avg", order: 2, color: "" },
  { metric: "Defensive Actions", group: "Defending", value: 64.0, per90: "3.57", tier: "above_avg", order: 2, color: "" },
  { metric: "Prog Pass", group: "Progression", value: 48.0, per90: "2.08", tier: "above_avg", order: 3, color: "" },
  { metric: "Prog Carry", group: "Progression", value: 36.0, per90: "1.33", tier: "above_avg", order: 3, color: "" },
  { metric: "Dribble Success %", group: "Progression", value: 56.0, per90: "0.34", tier: "elite", order: 3, color: "" },
  { metric: "Touches in Pen", group: "Shooting", value: 18.0, per90: "2.48", tier: "bottom", order: 4, color: "" },
  { metric: "npxG per Shot", group: "Shooting", value: 28.0, per90: "2.11", tier: "above_avg", order: 4, color: "" },
  { metric: "Shots", group: "Shooting", value: 23.53, per90: "0.18", tier: "elite", order: 4, color: "" },
  { metric: "Goals/Shot on Target %", group: "Shooting", value: 50.0, per90: "0.50", tier: "elite", order: 4, color: "" },
  { metric: "npxG", group: "Shooting", value: 38.0, per90: "0.38", tier: "above_avg", order: 4, color: "" },
  { metric: "Second Assists", group: "Creation", value: 66.0, per90: "0.06", tier: "elite", order: 5, color: "" },
  { metric: "Smart Passes", group: "Creation", value: 12.0, per90: "0.00", tier: "bottom", order: 5, color: "" },
  { metric: "xA per Assist", group: "Creation", value: 6.0, per90: "0.06", tier: "bottom", order: 5, color: "" },
  { metric: "Expected Assists", group: "Creation", value: 3.0, per90: "0.03", tier: "bottom", order: 5, color: "" },
  { metric: "Assists", group: "Creation", value: 8.0, per90: "0.53", tier: "bottom", order: 5, color: "" }
];

export const REQUIRED_COLUMNS = ["metric", "value", "group", "order"];
export const OPTIONAL_COLUMNS = ["subOrder", "per90", "tier", "color"];
export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

export const FONT_OPTIONS = [
  { label: "苹方 / PingFang", value: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif' },
  { label: "微软雅黑 / YaHei", value: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif' },
  { label: "思源黑体 / Noto Sans SC", value: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: "宋体 / SimSun", value: '"SimSun", "Songti SC", serif' },
  { label: "系统无衬线", value: 'system-ui, -apple-system, "Segoe UI", sans-serif' }
];

export const STORAGE_KEYS = {
  draft: "player_web_current_draft_v1",
  presets: "player_web_saved_presets_v1",
  selectedPresetId: "player_web_selected_preset_id_v1",
  localMigrated: "player_web_local_migrated_to_backend_v1",
  metricSelectionsByDataset: "player_web_metric_selection_by_dataset_v1",
  playerSearchByDataset: "player_web_player_search_by_dataset_v1",
  selectedPlayerByDataset: "player_web_selected_player_by_dataset_v1",
  scatterConfigByDataset: "player_web_scatter_config_by_dataset_v1",
  matchMetricSelectionsByDataset: "player_web_match_metric_selection_by_dataset_v1",
  matchTeamSearchByDataset: "player_web_match_team_search_by_dataset_v1",
  matchSelectedTeamByDataset: "player_web_match_selected_team_by_dataset_v1",
  matchHomeTeamByDataset: "player_web_match_home_team_by_dataset_v1",
  matchAwayTeamByDataset: "player_web_match_away_team_by_dataset_v1",
  matchRadarDraft: "player_web_match_radar_draft_v1",
  matchRadarImportPayload: "player_web_match_radar_import_payload_v1",
  matchRadarCompareConfig: "player_web_match_radar_compare_config_v1",
  matchRadarMetricMaxByDataset: "player_web_match_radar_metric_max_by_dataset_v1",
  matchRadarMetricPositionShiftByDataset: "player_web_match_radar_metric_position_shift_by_dataset_v1",
  fitnessSelectedDatasetId: "player_web_fitness_selected_dataset_id_v1",
  fitnessSharedDatasetId: "player_web_fitness_shared_dataset_id_v1",
  fitnessPlayerOverviewSide: "player_web_fitness_player_overview_side_v1",
  fitnessSelectedTeamMetricsByDataset: "player_web_fitness_selected_team_metrics_by_dataset_v1",
  fitnessTeamMetricMaxByDataset: "player_web_fitness_team_metric_max_by_dataset_v1",
  fitnessSelectedPlayerMetricsByDataset: "player_web_fitness_selected_player_metrics_by_dataset_v1",
  fitnessSelectedPlayersByDataset: "player_web_fitness_selected_players_by_dataset_v1",
  fitnessSelectedOverlayPlayerByDataset: "player_web_fitness_selected_overlay_player_by_dataset_v1",
  fitnessSingleMetricByDataset: "player_web_fitness_single_metric_by_dataset_v1",
  fitnessSingleMetricScopeByDataset: "player_web_fitness_single_metric_scope_by_dataset_v1",
  fitnessTeamRadarConfigByDataset: "player_web_fitness_team_radar_config_by_dataset_v1",
  fitnessPlayerRadarConfigByDataset: "player_web_fitness_player_radar_config_by_dataset_v1",
  fitnessPer90SelectedMetricsByDataset: "player_web_fitness_per90_selected_metrics_by_dataset_v1",
  fitnessPer90SelectedPlayersByDataset: "player_web_fitness_per90_selected_players_by_dataset_v1",
  fitnessPer90SelectedOverlayPlayerByDataset: "player_web_fitness_per90_selected_overlay_player_by_dataset_v1",
  fitnessPer90SingleMetricByDataset: "player_web_fitness_per90_single_metric_by_dataset_v1",
  fitnessPer90SingleMetricScopeByDataset: "player_web_fitness_per90_single_metric_scope_by_dataset_v1",
  fitnessPer90RadarConfigByDataset: "player_web_fitness_per90_radar_config_by_dataset_v1",
  optaSelectedDatasetId: "player_web_opta_selected_dataset_id_v1",
  optaImportSide: "player_web_opta_import_side_v1",
  cslStandingsSelectedDatasetId: "player_web_csl_standings_selected_dataset_id_v1",
  cslStandingsSelectedSeason: "player_web_csl_standings_selected_season_v1",
  cslStandingsSelectedTeamsByDataset: "player_web_csl_standings_selected_teams_by_dataset_v1",
  cslStandingsSelectedMetrics: "player_web_csl_standings_selected_metrics_v1",
  cslStandingsSelectedRoundByDataset: "player_web_csl_standings_selected_round_by_dataset_v1",
  playerPersonalRadarSelectedMetricsByDataset: "player_web_player_personal_radar_selected_metrics_by_dataset_v1",
  playerPersonalRadarSelectedPlayersByDataset: "player_web_player_personal_radar_selected_players_by_dataset_v1",
  playerPersonalRadarSelectedOverlayPlayerByDataset: "player_web_player_personal_radar_selected_overlay_player_by_dataset_v1",
  playerPersonalRadarSingleMetricByDataset: "player_web_player_personal_radar_single_metric_by_dataset_v1",
  playerPersonalRadarSingleMetricScopeByDataset: "player_web_player_personal_radar_single_metric_scope_by_dataset_v1",
  playerPersonalRadarConfigByDataset: "player_web_player_personal_radar_config_by_dataset_v1"
};

export const REORDER_MODE_VIEW = "view";
export const REORDER_MODE_ORDER = "order";

export type NavChildItem = {
  key: string;
  label: string;
};

export type NavItem = NavChildItem & {
  children?: NavChildItem[];
};

export const NAV_ITEMS = [
  { key: "home", label: "主页" },
  {
    key: "data_radar_menu",
    label: "数据雷达图",
    children: [
      { key: "player_data", label: "球员数据" },
      { key: "radar", label: "雷达图生成器" }
    ]
  },
  {
    key: "scatter_analysis_menu",
    label: "数据散点图",
    children: [
      { key: "scatter_plot", label: "数据散点图" },
      { key: "player_personal_radar", label: "个人雷达图" }
    ]
  },
  {
    key: "match_summary_menu",
    label: "比赛数据总结",
    children: [
      { key: "match_team_data", label: "球队数据" },
      { key: "match_radar", label: "比赛雷达图" }
    ]
  },
  {
    key: "fitness_analysis_menu",
    label: "体能数据分析",
    children: [
      { key: "fitness_team_radar", label: "两队体能雷达图" },
      { key: "fitness_player_overlay", label: "球员体能叠加雷达" },
      { key: "fitness_per90", label: "分均体能数据" }
    ]
  },
  { key: "opta_analysis", label: "opta数据分析" },
  { key: "csl_standings_trend", label: "中超积分走势" },
  {
    key: "mapping_menu",
    label: "对应表",
    children: [
      { key: "project_mapping", label: "项目对应表" },
      { key: "match_project_mapping", label: "比赛项目对应表" },
      { key: "name_mapping", label: "姓名对应表" },
      { key: "team_mapping", label: "球队对应表" }
    ]
  },
  { key: "about", label: "About" }
] satisfies NavItem[];

export const METRIC_GROUP_RULES = [
  { group: "对抗", order: 2, keywords: ["duel", "aerial", "对抗", "空中对抗"] },
  { group: "防守", order: 3, keywords: ["def", "tackle", "interception", "foul", "防守", "抢断", "拦截", "犯规", "padj"] },
  { group: "传球", order: 1, keywords: ["pass", "cross", "assist", "progressive pass", "传球", "长传", "关键传球", "向前传球", "推进传球"] }
];

export const DEFAULT_META = {
  player: "Alberto Quiles Piosa",
  playerZh: "",
  age: "30",
  position: "CF",
  minutes: "2901",
  club: "Tianjin Tigers",
  league: "Chinese Super League",
  season: "2025"
};

export const DEFAULT_TEXT_STYLE = {
  fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  titleSize: 28,
  subtitleSize: 16,
  metricSize: 14,
  groupSize: 16,
  per90Size: 12,
  tickSize: 12,
  legendSize: 14
};

export const DEFAULT_CHART_STYLE = {
  backgroundColor: "#f8f5ef",
  ringStrokeWidth: 1,
  innerRingStrokeWidth: 2,
  ringLineStyle: "dashed",
  ringDasharray: "4 8",
  groupSeparatorWidth: 1.2,
  groupSeparatorLength: 0,
  groupSeparatorOffset: 0,
  groupLabelRadius: 540,
  groupLabelOffsetX: 0,
  groupLabelOffsetY: 0
};

export const DEFAULT_CENTER_IMAGE = {
  src: "",
  scale: 1
};

export const DEFAULT_CORNER_IMAGE = {
  src: "",
  size: 130,
  x: 60,
  y: 120
};

export const CANVAS_WIDTH = 1240;
export const CANVAS_HEIGHT = 1240;
export const CENTER_X = 620;
export const CENTER_Y = 660;
export const INNER_RING = 118;
export const MAX_RADIAL_LENGTH = 320;
export const METRIC_LABEL_RADIUS = INNER_RING + MAX_RADIAL_LENGTH + 30;
export const BAR_INNER_GAP = 6;
