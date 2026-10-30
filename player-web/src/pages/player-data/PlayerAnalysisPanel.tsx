import React, { useEffect, useRef, useState } from 'react';
import { fetchPlayerById } from '../../api/storageClient';
import { analysisKey, analysisReady, generatePlayerAnalysis, type AnalysisInput } from './playerAnalysis';
import './player-analysis.css';
export default function PlayerAnalysisPanel({ input, loading, label }: { input: AnalysisInput; loading: boolean; label: (s: string) => string }) {
  const [saved, setSaved] = useState<{ key: string; report: ReturnType<typeof generatePlayerAnalysis> } | null>(null);
  const key = analysisKey(input);
  const latestKey = useRef(key);
  latestKey.current = key;
  const requestSequence = useRef(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    requestSequence.current += 1;
    setGenerating(false);
    setError('');
    setSaved(previous => previous && (loading || previous.key !== key) ? { ...previous, key: '' } : previous);
  }, [key, loading]);
  useEffect(() => () => { requestSequence.current += 1; }, []);
  async function generate() {
    const sequence = ++requestSequence.current;
    const requestedKey = key;
    setGenerating(true);
    setError('');
    try {
      const result = await fetchPlayerById(input.playerId, input.datasetId, 'position');
      if (requestSequence.current !== sequence || latestKey.current !== requestedKey) return;
      const detail = result.player ? { ...result.player, datasetId: result.datasetId, updatedAt: result.updatedAt } : null;
      setSaved({ key: requestedKey, report: generatePlayerAnalysis({ ...input, detail }, label) });
    } catch (err: any) {
      if (requestSequence.current === sequence && latestKey.current === requestedKey) setError(err.message || '同位置数据读取失败，请重试。');
    } finally {
      if (requestSequence.current === sequence) setGenerating(false);
    }
  }
  const current = saved?.key === key && !loading;
  const report = current ? saved!.report : null;
  const modeLabel = input.mode === 'smoothed' ? '算法评分' : '标准百分位';
  const sections = report ? [['主要特点与优势', report.narrative.strengths], ['需要关注的方面', report.narrative.reviews], ['其他表现', report.narrative.other]] as const : [];
  return <section className="player-analysis" aria-label="球员规则分析">
    <div className="player-analysis-heading"><div><h2>球员分析</h2><p>以数据为依据，呈现表现特征与观察重点。</p></div>
      <button disabled={loading || generating || !analysisReady(input)} onClick={generate}>{generating ? '生成中…' : saved ? '重新生成球员分析' : '生成球员分析'}</button></div>
    {error ? <p role="alert">{error}</p> : null}
    {saved && !current ? <p role="status">球员、指标或数据口径已变化，请重新生成分析。</p> : null}
    {report ? <article aria-live="polite">
      <header className="player-analysis-report-title"><span>球员观察报告</span><h3>{report.player}</h3><p>{input.datasetName || input.datasetId} · {modeLabel}</p></header>
      <section className="player-analysis-prose"><h4>球员概述</h4><p>{report.narrative.profile}</p></section>
      {sections.map(([title, paragraphs]) => <section className="player-analysis-prose" key={title}><h4>{title}</h4>
        {paragraphs.length ? paragraphs.map((paragraph, index) => <p key={index}>{paragraph.text}</p>) : <p>{title === '主要特点与优势' ? '当前所选指标尚未形成可以明确支持的突出特点。补充相关数据后，可能获得更完整的观察。' : title === '需要关注的方面' ? '当前所选指标未形成明确的低位或反差信号，这并不意味着球员不存在需要改进的方面。' : '其余所选指标暂未形成额外的主题判断，具体记录可在数据依据中查看。'}</p>}
      </section>)}
      <details className="player-analysis-evidence"><summary>数据依据与分析说明</summary>
        <p>规则 v3 · Research。报告在当前数据集中按首个登记位置精确匹配同位置球员，并单独重算排名与评分；包含自身，每项指标只使用有效记录。原有数据表和雷达的全数据集百分位不变。算法模式使用平滑或稀疏事件评分，不等于实际超过球员的比例。</p>
        <p>{report.overview}正文最多展示三段主要特点、三段观察重点及两段其他表现。{report.narrative.remainingThemes ? `另有 ${report.narrative.remainingThemes} 个主题未进入正文；全部有效指标仍列于下方。` : ''}</p>
        <p>分区规则：≥90 高位，65≤评分&lt;90 较高，35&lt;评分&lt;65 中间，10&lt;评分≤35 较低，≤10 低位。次数不等于效率；成功率还需要实际尝试次数来验证稳定性。球队环境和比赛强度需要结合录像核查。</p>
        {report.notices.length ? <p>{report.notices.join(' ')}</p> : null}
        {report.narrative.unused.length ? <p>部分字段未匹配足球主题或方向配置不同，仅保留数据依据，不据此推断能力。</p> : null}
        <div className="player-analysis-evidence-table"><table><thead><tr><th>原字段</th><th>原值</th><th>{modeLabel}</th><th>有效记录</th><th>算法依据</th></tr></thead><tbody>
          {report.facts.map((f,index) => <tr key={`${f.evidence.column}-${index}`}><td>{f.evidence.column}</td><td>{String(f.evidence.value)}</td><td>{f.score.toFixed(2)}</td><td>{f.evidence.comparisonCount}</td><td>{f.evidence.percentileAlgorithmLabel || f.evidence.percentileAlgorithm}；{input.mode === 'smoothed' ? f.evidence.smoothingReason : '按字段方向计算并列中位分布位置'}</td></tr>)}
        </tbody></table></div>
        {report.skipped.length ? <details><summary>未作评价的指标（{report.skipped.length}）</summary>{report.skipped.map((n,index) => <p key={index}>{n}</p>)}</details> : null}
      </details>
    </article> : <p className="player-analysis-source">按同位置球员比较，生成中文观察报告。无需外部 AI 服务。</p>}
  </section>;
}
