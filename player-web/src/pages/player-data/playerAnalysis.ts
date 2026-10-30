import { buildPlayerNarrative } from './playerNarrative';
// Research v2: thematic Chinese prose. Percentiles come from the server unchanged.
export type MetricEvidence = {
  column: string; value: unknown; isNumeric?: boolean; rawPercentile?: number | null;
  adjustedPercentile?: number | null; percentileAlgorithm?: string; percentileAlgorithmLabel?: string;
  comparisonCount?: number; comparisonHasVariation?: boolean; smoothingReason?: string;
};
export type AnalysisInput = {
  datasetId: string; datasetName: string; playerId: string; mode: string;
  selectedColumns: string[]; detail: { id: string; player: string; datasetId: string; updatedAt?: string; comparison?: { mode: string; position?: string; playerCount?: number }; columns: MetricEvidence[] } | null;
};
type Finding = { text: string; evidence: MetricEvidence; score: number; label: string };
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
// Only explicitly understood fields receive football interpretations. Unknown fields stay descriptive.
const meanings: Record<string, { kind: 'volume' | 'efficiency' | 'outcome'; description: string }> = {};
function register(columns: string[], kind: 'volume' | 'efficiency' | 'outcome', description: string) {
  for (const c of columns) meanings[norm(c)] = { kind, description };
}
register(['Shots per 90'], 'volume', '射门参与量');
register(['Passes per 90'], 'volume', '传球参与量');
register(['Progressive passes per 90'], 'volume', '向前输送参与量');
register(['Progressive runs per 90'], 'volume', '持球推进参与量');
register(['Dribbles per 90'], 'volume', '尝试突破的频率');
register(['Aerial duels per 90'], 'volume', '空中争夺参与量');
register(['Defensive duels per 90'], 'volume', '防守对抗参与量');
register(['Offensive duels per 90'], 'volume', '进攻对抗参与量');
register(['Crosses per 90'], 'volume', '传中参与量');
register(['Interceptions per 90', 'PAdj Interceptions'], 'volume', '拦截活动量');
register(['Successful defensive actions per 90'], 'volume', '成功防守行动量');
register(['Key passes per 90', 'Shot assists per 90'], 'volume', '为队友提供射门机会的活动量');
register(['Accurate passes, %'], 'efficiency', '传球成功率');
register(['Accurate progressive passes, %'], 'efficiency', '向前输送的成功率');
register(['Successful dribbles, %'], 'efficiency', '突破成功率');
register(['Aerial duels won, %'], 'efficiency', '空中争夺成功率');
register(['Defensive duels won, %'], 'efficiency', '防守对抗成功率');
register(['Offensive duels won, %'], 'efficiency', '进攻对抗成功率');
register(['Accurate crosses, %'], 'efficiency', '传中成功率');
register(['Shots on target, %'], 'efficiency', '射门命中目标的比例');
register(['Save rate, %', 'Save percentage, %'], 'efficiency', '扑救成功率');
register(['Goals per 90', 'Non-penalty goals per 90'], 'outcome', '进球产出');
register(['Assists per 90'], 'outcome', '助攻产出');
register(['xG per 90', 'Non-penalty xG per 90'], 'outcome', '预期进球机会产出');
register(['xA per 90'], 'outcome', '预期助攻产出');
register(['Fouls per 90'], 'outcome', '犯规事件频率');
register(['Losses per 90'], 'outcome', '丢失球权事件频率');
register(['Conceded goals per 90', 'xG against per 90'], 'outcome', '失球或预期失球记录（受到球队防守环境影响）');
const contextColumns = new Set(['age', 'height', 'weight', 'minutes played', 'matches played', 'market value', 'contract expires']);
export function analysisKey(input: AnalysisInput): string {
  return JSON.stringify([input.datasetId, input.datasetName, input.playerId, input.mode,
    [...input.selectedColumns].sort(), input.detail]);
}
export function analysisReady(input: AnalysisInput): boolean {
  return Boolean(input.datasetId && input.playerId && input.selectedColumns.length && input.detail &&
    input.detail.id === input.playerId && input.detail.datasetId === input.datasetId);
}
export function generatePlayerAnalysis(input: AnalysisInput, label: (s: string) => string = s => s) {
  if (!analysisReady(input)) throw new Error('请等待当前球员数据加载完成，并勾选指标。');
  if (input.detail?.comparison?.mode !== 'position') throw new Error('请先取得同位置比较数据，再生成报告。');
  const detail = input.detail!;
  const selected = new Set(input.selectedColumns);
  const position = String(detail.columns.find(r => norm(r.column) === 'position')?.value ?? '').trim();
  const goalkeeperField = /^(save rate|save percentage|conceded goals|shots against|xg against|prevented goals|clean sheets|exits|back passes received as gk)(,| per 90|$)/i;
  const facts: Finding[] = [];
  const skipped: string[] = [];
  const notices = new Set<string>();
  for (const row of detail.columns.filter(r => selected.has(r.column))) {
    if (position && !/\bGK\b|门将|goalkeeper/i.test(position) && goalkeeperField.test(row.column.trim())) {
      skipped.push(`${label(row.column)}：当前球员位置非门将，不评价门将专属指标`); continue;
    }
    const score = input.mode === 'smoothed' ? row.adjustedPercentile : row.rawPercentile;
    if (contextColumns.has(norm(row.column)) || row.percentileAlgorithm === 'exclude') {
      skipped.push(`${label(row.column)}：背景信息，不作能力评价`); continue;
    }
    if (!row.isNumeric || typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100 ||
        row.value === null || row.value === undefined || String(row.value).trim() === '') {
      skipped.push(`${label(row.column)}：缺少可用原值或评分`); continue;
    }
    if (!Number.isInteger(row.comparisonCount) || row.comparisonCount! < 8 || row.comparisonHasVariation !== true) {
      skipped.push(`${label(row.column)}：比较人数不足 8、人数未知或全体同值，仅保留原始表格`); continue;
    }
    if (row.comparisonCount! < 30) notices.add('部分指标比较人数不足 30，分布位置容易随少量球员变动。');
    const semantic = meanings[norm(row.column)];
    const inverse = row.percentileAlgorithm?.endsWith('_negative');
    const expectedInverse = ['fouls per 90', 'losses per 90', 'conceded goals per 90', 'xg against per 90'].includes(norm(row.column));
    const interpreted = semantic && Boolean(inverse) === expectedInverse;
    const level = score >= 90 ? '处于高位区间' : score >= 65 ? '处于较高区间' : score <= 10 ? '处于低位区间' : score <= 35 ? '处于较低区间' : '处于中间区间';
    let text = `${label(row.column)}在当前比较口径下${level}。`;
    if (interpreted) {
      if (semantic.kind === 'volume') text += `${semantic.description}${score >= 65 ? '较多' : score <= 35 ? '较少' : '居中'}；参与量不能单独证明效率或能力，需结合战术任务和成功率。`;
      else if (inverse) text += `${semantic.description}按越低越好的方向评价；高评分意味着原始事件量较少，不能直接推断决策质量。`;
      else text += `${semantic.description}${score >= 65 ? '是本次所选指标中值得关注的表现' : score <= 35 ? '值得结合比赛录像进一步核查' : '未呈现明显的分布两端特征'}。`;
    } else text += '此字段仅作分布描述，不推断技术能力或战术职责。';
    facts.push({ text, evidence: row, score, label: label(row.column) });
  }
  const rawContext = ['Team', 'Position', 'Age', 'Minutes played'].map(column => {
    const row = detail.columns.find(r => norm(r.column) === norm(column));
    return row && String(row.value ?? '').trim() ? `${label(column)}：${row.value}` : '';
  }).filter(Boolean);
  const minutes = detail.columns.find(r => norm(r.column) === 'minutes played');
  const mins = Number(String(minutes?.value ?? '').replace(/,/g, ''));
  if (!minutes || !String(minutes.value ?? '').trim() || !Number.isFinite(mins)) notices.add('缺少出场分钟信息，无法评估累计样本的稳定性。');
  else if (mins < 900) notices.add(`出场 ${mins} 分钟，累计样本有限；高百分位不能代替长期稳定表现。`);
  if (!facts.length) notices.add('本次没有满足解释条件的指标，请检查勾选、缺失值及比较人数。');
  const high = facts.filter(f => f.score >= 65).sort((a,b) => b.score-a.score);
  const low = facts.filter(f => f.score <= 35).sort((a,b) => a.score-b.score);
  const middle = facts.filter(f => f.score > 35 && f.score < 65);
  const features: string[] = [];
  const pairs = [
    ['Aerial duels per 90', 'Aerial duels won, %', '空中争夺'],
    ['Defensive duels per 90', 'Defensive duels won, %', '防守对抗'],
    ['Offensive duels per 90', 'Offensive duels won, %', '进攻对抗'],
    ['Dribbles per 90', 'Successful dribbles, %', '突破'],
    ['Crosses per 90', 'Accurate crosses, %', '传中'],
    ['Passes per 90', 'Accurate passes, %', '传球'],
    ['Progressive passes per 90', 'Accurate progressive passes, %', '向前输送'],
  ];
  const level = (score: number) => score >= 65 ? '较高' : score <= 35 ? '较低' : '居中';
  for (const [volumeColumn, efficiencyColumn, description] of pairs) {
    const volume = facts.find(f => norm(f.evidence.column) === norm(volumeColumn));
    const efficiency = facts.find(f => norm(f.evidence.column) === norm(efficiencyColumn));
    if (!volume || !efficiency || volume.evidence.percentileAlgorithm?.endsWith('_negative') || efficiency.evidence.percentileAlgorithm?.endsWith('_negative')) continue;
    features.push(`${description}：参与量评分${level(volume.score)}，成功率评分${level(efficiency.score)}。依据：${volume.label} ${String(volume.evidence.value)}（评分 ${volume.score.toFixed(2)}），${efficiency.label} ${String(efficiency.evidence.value)}（评分 ${efficiency.score.toFixed(2)}）。${volume.score >= 65 && efficiency.score <= 35 ? '参与较多而成功率处于较低区间，值得核查尝试难度与比赛环境。' : volume.score <= 35 && efficiency.score >= 65 ? '参与较少而成功率处于较高区间，不能据此推断扩大参与后的表现。' : '数量与效率是不同维度，需结合实际尝试次数和比赛录像。'}`);
  }
  return {
    narrative: buildPlayerNarrative(input, facts),
    player: detail.player, context: rawContext.join(' · '), facts, high, low, middle, features, skipped, notices: [...notices],
    overview: `本次勾选 ${selected.size} 项指标，其中 ${facts.length} 项满足解释条件：${high.length} 项处于较高或高位区间，${low.length} 项处于较低或低位区间。报告只描述本次所选指标，不代表完整球员能力画像。`,
  };
}
