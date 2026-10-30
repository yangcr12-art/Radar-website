import type { AnalysisInput, MetricEvidence } from './playerAnalysis';

type Fact = { evidence: MetricEvidence; score: number; label: string };
type Theme = { name: string; fields: string[]; high: string; low: string; neutral: string; volume?: string; efficiency?: string; inverse?: boolean };
export type ReportParagraph = { text: string; evidence: Fact[] };
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const themes: Theme[] = [
  { name: '机会创造', fields: ['xA per 90','Key passes per 90','Shot assists per 90','Assists per 90','Passes to penalty area per 90','Deep completions per 90'], high: '为队友创造机会是他的一项特点', low: '为队友创造射门机会的产出值得进一步关注', neutral: '机会创造的相关指标主要落在同位置球员的中间水平' },
  { name: '射门与进球', fields: ['Non-penalty xG per 90','xG per 90','Shots per 90','Non-penalty goals per 90','Goals per 90','Goal conversion, %','Shots on target, %'], high: '他在射门与进球方面有较突出的表现', low: '射门与进球环节存在需要核查的指标', neutral: '射门与进球相关表现尚未呈现明显的分布两端特征', volume: 'Shots per 90', efficiency: 'Goal conversion, %' },
  { name: '向前输送', fields: ['Progressive passes per 90','Accurate progressive passes, %','Passes to final third per 90','Accurate passes to final third, %','Through passes per 90','Accurate through passes, %'], high: '向前传球是他的一项特点', low: '向前输送的部分数据处于较低区间', neutral: '向前输送的数据整体较为居中', volume: 'Progressive passes per 90', efficiency: 'Accurate progressive passes, %' },
  { name: '持球突破', fields: ['Dribbles per 90','Successful dribbles, %','Progressive runs per 90'], high: '持球突破与推进是他的一项特点', low: '持球突破与推进的表现值得结合比赛过程复核', neutral: '持球突破与推进的指标主要处于中间区间', volume: 'Dribbles per 90', efficiency: 'Successful dribbles, %' },
  { name: '传中', fields: ['Crosses per 90','Accurate crosses, %','Crosses from left flank per 90','Crosses from right flank per 90','Deep completed crosses per 90'], high: '传中是他的一项特点', low: '传中环节的参与量或完成效果需要进一步观察', neutral: '传中相关数据未呈现明显的两端特征', volume: 'Crosses per 90', efficiency: 'Accurate crosses, %' },
  { name: '传球参与', fields: ['Passes per 90','Accurate passes, %','Long passes per 90','Accurate long passes, %'], high: '他在传球方面有较突出的表现', low: '传球参与与完成情况存在值得复核的环节', neutral: '传球参与与完成情况主要处于中间区间', volume: 'Passes per 90', efficiency: 'Accurate passes, %' },
  { name: '空中争夺', fields: ['Aerial duels per 90','Aerial duels won, %'], high: '他在空中争夺中有较突出的表现', low: '空中争夺值得列入录像观察重点', neutral: '空中争夺数据主要处于中间区间', volume: 'Aerial duels per 90', efficiency: 'Aerial duels won, %' },
  { name: '防守对抗', fields: ['Defensive duels per 90','Defensive duels won, %','Successful defensive actions per 90','Interceptions per 90','PAdj Interceptions','Sliding tackles per 90','Shots blocked per 90'], high: '他在防守端有较突出的表现', low: '防守对抗及相关行动存在值得核查的部分', neutral: '防守对抗与相关活动主要落在中间区间', volume: 'Defensive duels per 90', efficiency: 'Defensive duels won, %' },
  { name: '进攻对抗', fields: ['Offensive duels per 90','Offensive duels won, %','Fouls suffered per 90'], high: '进攻对抗是他的一项特点', low: '进攻对抗的相关表现需要进一步观察', neutral: '进攻对抗的表现主要落在中间区间', volume: 'Offensive duels per 90', efficiency: 'Offensive duels won, %' },
  { name: '扑救', fields: ['Save rate, %','Save percentage, %','Prevented goals per 90'], high: '扑救是他较突出的表现', low: '扑救相关指标值得结合实际射门情境复核', neutral: '扑救相关数据主要处于中间区间' },
  { name: '失球环境', fields: ['Conceded goals per 90','xG against per 90'], high: '失球与预期失球记录按反向口径呈现较高评分', low: '失球与预期失球记录按反向口径处于较低区间', neutral: '失球环境的相关数据主要处于中间区间', inverse: true },
  { name: '球权丢失', fields: ['Losses per 90'], high: '他较少丢失球权', low: '他丢失球权的情况值得关注', neutral: '球权丢失记录按反向口径主要处于中间区间', inverse: true },
  { name: '犯规与纪律', fields: ['Fouls per 90','Yellow cards per 90','Red cards per 90'], high: '他在犯规和吃牌方面控制得较好', low: '他的犯规和吃牌情况值得关注', neutral: '犯规与纪律记录主要处于中间区间', inverse: true },
];
const cleanLabel = (fact: Fact) => fact.label.replace(/\s*\([^)]*\)\s*$/, '').replace(/（%）/g, '').trim();
function citation(fact: Fact, mode: string) {
  const metric = cleanLabel(fact);
  // A missing translation remains an original field name; never invent a translation.
  const value = String(fact.evidence.value);
  const unit = /,\s*%\s*$/.test(fact.evidence.column) && !value.trim().endsWith('%') ? '%' : '';
  return `${metric}为${value}${unit}（${mode === 'smoothed' ? '算法评分' : '百分位'} ${fact.score.toFixed(1)}）`;
}
const band = (f: Fact) => f.score >= 65 ? '较高区间' : f.score <= 35 ? '较低区间' : '中间区间';
export function buildPlayerNarrative(input: AnalysisInput, facts: Fact[]) {
  const get = (column: string) => input.detail?.columns.find(r => normalize(r.column) === normalize(column))?.value;
  const present = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';
  const positionNames: Record<string,string> = { GK:'门将', CB:'中后卫', LCB:'左中卫', RCB:'右中卫', LB:'左后卫', RB:'右后卫', LWB:'左翼卫', RWB:'右翼卫', DMF:'防守中场', LDMF:'左侧防守中场', RDMF:'右侧防守中场', CMF:'中前卫', LCMF:'左中前卫', RCMF:'右中前卫', AMF:'进攻中场', LAMF:'左侧进攻中场', RAMF:'右侧进攻中场', LW:'左边锋', RW:'右边锋', LWF:'左边锋', RWF:'右边锋', CF:'中锋', SS:'影锋' };
  const age = get('Age'); const team = get('Team'); const position = get('Position'); const foot = get('Foot'); const height = get('Height'); const minutes = get('Minutes played');
  const profileParts = [present(age) ? `${age}岁` : '', present(position) ? `位置为${String(position).split(/[,/]/).map(s => positionNames[s.trim().toUpperCase()] || s.trim()).join('、')}` : '', present(team) ? `效力于${team}` : '', present(foot) ? `惯用${({'right':'右脚','left':'左脚','both':'双脚'}[String(foot).toLowerCase()] || foot)}` : '', present(height) ? `身高记录为${height}` : ''].filter(Boolean);
  const mins = Number(String(minutes ?? '').replace(/,/g,''));
  let profile = `${input.detail?.player || '该球员'}${profileParts.length ? '，' + profileParts.join('，') : ''}。`;
  if (present(minutes) && Number.isFinite(mins)) profile += `当前数据记录的出场时间为${minutes}分钟，${mins < 900 ? '累计样本仍然有限，以下特征应视为阶段性观察' : '已有一定比赛积累，可用于观察其现阶段的数据特征'}。`;
  else profile += '当前资料缺少可用出场分钟，样本稳定性尚无法判断。';
  profile += `本报告根据所选指标，比较他与同位置球员的表现。`;
  const strengths: ReportParagraph[] = [], reviews: ReportParagraph[] = [], other: ReportParagraph[] = [];
  const used = new Set<Fact>();
  for (const theme of themes) {
    const fields = new Set(theme.fields.map(normalize));
    const matching = facts.filter(f => fields.has(normalize(f.evidence.column)) && Boolean(f.evidence.percentileAlgorithm?.endsWith('_negative')) === Boolean(theme.inverse));
    const seen = new Set<string>();
    const available = matching.filter(f => { const n=normalize(f.evidence.column); if(seen.has(n)) return false; seen.add(n); return true; });
    if (!available.length) continue;
    available.forEach(f=>used.add(f));
    const volume = available.find(f => normalize(f.evidence.column) === normalize(theme.volume || ''));
    const efficiency = available.find(f => normalize(f.evidence.column) === normalize(theme.efficiency || ''));
    if (volume && efficiency) {
      let opening: string; let interpretation: string; let destination: ReportParagraph[];
      if (volume.score >= 65 && efficiency.score <= 35) {
        opening = `他在${theme.name}中尝试较多，但成功率偏低`; interpretation = '相比同位置球员，他更频繁地尝试，但完成质量没有跟上。可以重点看他在哪些情况下容易失误，是否经常尝试难度较高的处理。'; destination=reviews;
      } else if (volume.score <= 35 && efficiency.score >= 65) {
        opening = `${theme.name}的特点是参与较少、成功率较高`; interpretation = '他参与的次数比同位置球员少，但已有尝试的成功率较高。值得看一看球队是否较少安排他承担这类任务，以及增加尝试后能否保持成功率。'; destination=other;
      } else if (volume.score >= 65 && efficiency.score >= 65) {
        opening = `${theme.name}是他的一项优势`; interpretation = '他既参与得更多，也保持了较高的成功率，在同位置球员中较为突出。'; destination=strengths;
      } else if (efficiency.score <= 35) {
        opening = `他的${theme.name}成功率偏低`; interpretation = '值得看一看他通常在哪些情况下失败，是处理本身没有做好，还是经常需要尝试难度较高的动作。'; destination=reviews;
      } else if (volume.score >= 65) {
        opening = `他在${theme.name}中的参与较为活跃`; interpretation = '相比同位置球员，他的特点是尝试更多，成功率则接近中间水平。'; destination=strengths;
      } else {
        opening = volume.score <= 35 ? `他较少参与${theme.name}` : `他的${theme.name}参与次数接近同位置的中间水平`; interpretation = `成功率处于${band(efficiency)}。${volume.score <= 35 ? '更值得了解的是，他是否承担较少的这类任务，而不是直接把参与少看作能力不足。' : efficiency.score >= 65 ? '相比参与次数，成功率更为突出。' : '目前没有明显拉开与同位置球员的差距。'}`; destination=other;
      }
      const supporting = available.filter(f => f!==volume && f!==efficiency && f.score>=65).sort((a,b)=>b.score-a.score).slice(0,1);
      const evidence=[volume,efficiency,...supporting];
      destination.push({text:`${opening}。${citation(volume,input.mode)}，而${citation(efficiency,input.mode)}；${interpretation}${supporting.length ? `此外，${citation(supporting[0],input.mode)}，也高于多数同位置球员。` : ''}`,evidence});
      // Contrasting supplementary metrics remain visible as a separate review paragraph.
      const remainingLow=available.filter(f=>f!==volume && f!==efficiency && f.score<=35);
      if(remainingLow.length) reviews.push({text:`不过，他在${theme.name}中也有需要留意的地方。${remainingLow.slice(0,2).map(f=>citation(f,input.mode)).join('，')}低于多数同位置球员。这说明他在这一环节并非每项表现都突出，可以重点看这些行动较少或失败较多的原因。`,evidence:remainingLow.slice(0,2)});
      continue;
    }
    const high=available.filter(f=>f.score>=65).sort((a,b)=>b.score-a.score).slice(0,3);
    const low=available.filter(f=>f.score<=35).sort((a,b)=>a.score-b.score).slice(0,3);
    if(high.length) strengths.push({text:`${theme.high}。${high.map(f=>citation(f,input.mode)).join('，')}，${theme.inverse ? '在同位置比较中评分较高，说明相关事件发生得较少' : `${high.length > 1 ? '均高于' : '高于'}多数同位置球员`}。`,evidence:high});
    if(low.length) reviews.push({text:`${theme.low}。${low.map(f=>citation(f,input.mode)).join('，')}，${low.length > 1 ? '这些记录均落' : '这一记录落'}在较低区间。${theme.inverse ? '这意味着相关事件比多数同位置球员更多，值得看一看它们通常发生在什么情况下。' : '可以重点看他是否较少获得这类机会，还是在获得机会后完成得不够好。'}`,evidence:low});
    if(!high.length && !low.length) other.push({text:`${theme.neutral}。${available.slice(0,2).map(f=>citation(f,input.mode)).join('，')}，与同位置球员相比，这些表现较为常见，暂时没有明显优势或短板。`,evidence:available.slice(0,2)});
  }
  // Prioritize supported patterns by evidence coverage, then extremity. No composite player score.
  const sortParagraphs=(items:ReportParagraph[])=>items.sort((a,b)=>b.evidence.length-a.evidence.length || Math.max(...b.evidence.map(f=>Math.abs(f.score-50)))-Math.max(...a.evidence.map(f=>Math.abs(f.score-50))));
  sortParagraphs(strengths);sortParagraphs(reviews);sortParagraphs(other);
  const unused=facts.filter(f=>!used.has(f));
  if (!used.size) profile += '本次所选字段尚不足以匹配已定义的足球主题，暂不生成能力解读；可在依据中查看记录，或补选相关指标。';
  if (input.mode === 'smoothed') {
    for (const paragraph of [...strengths, ...reviews, ...other]) {
      paragraph.text = paragraph.text.replace(/均高于多数同位置球员/g, '在同位置算法评分中均处于较高水平').replace(/也高于多数同位置球员/g, '在同位置算法评分中也较突出').replace(/高于多数同位置球员/g, '在同位置算法评分中处于较高水平').replace(/低于多数同位置球员/g, '在同位置算法评分中处于较低水平');
    }
  }
  return { profile, strengths:strengths.slice(0,3), reviews:reviews.slice(0,3), other:other.slice(0,2), unused, remainingThemes:Math.max(0,strengths.length-3)+Math.max(0,reviews.length-3)+Math.max(0,other.length-2) };
}
