import React, { useEffect, useMemo, useState } from "react";
import { fetchFitnessHistory, importFitnessHistory } from "../../api/storageClient";
import { getNameMappingRows, getPlayerZhByEnglish } from "../../utils/nameMappingStore";
import { readFitnessHistorySettings, saveFitnessHistorySettings } from "./fitnessHistorySession";
import "./fitness-history.css";

type Player = { player: string; sourcePlayer: string; team: string; opponent: string; side: string; raw: Record<string, unknown> };
type Match = { id: string; date: string; competition: string; match: string; sourceFile: string; players: Player[] };
const number = (v: unknown): number | null => {
  if (v === null || v === undefined || typeof v === "boolean" || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null;
};
const format = (v: number | null) => v === null ? "—" : v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
const identity = (p: Player) => JSON.stringify([p.team, p.player]);
const label = (p: Player) => getPlayerZhByEnglish(p.player) || p.player;
const reportOrder = ["出场时间", "总距离 (米)", "高速跑距离 (米)", "高速跑次数", "高加速次数 (3–10 米/秒²)", "高减速次数 (-3至-10 米/秒²)", "冲刺距离 (米)", "冲刺次数", "最快速度 (千米/时)"];
const columnLabel = (c: string) => c === "出场时间" ? "出场时间 (分钟)" : c;
function MetricHeader({ column }: { column: string }) {
  const text = columnLabel(column);
  const parts = text.match(/^(.+?)\s*\((.+)\)$/);
  return <><span className="fh-metric-name">{parts ? parts[1] : text}</span><span className="fh-metric-unit">{parts ? parts[2] : "次数"}</span></>;
}

export default function FitnessHistoryPage() {
  const [initialSettings] = useState(readFitnessHistorySettings);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState(initialSettings.selected);
  const [search, setSearch] = useState(initialSettings.search);
  const [competition, setCompetition] = useState(initialSettings.competition);
  const [start, setStart] = useState(initialSettings.start); const [end, setEnd] = useState(initialSettings.end);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [fields, setFields] = useState<string[] | null>(initialSettings.fields);
  useEffect(() => {
    saveFitnessHistorySettings({ selected, search, competition, start, end, fields });
  }, [selected, search, competition, start, end, fields]);
  const load = () => { setLoading(true); setError(""); fetchFitnessHistory().then(r => setMatches(r.matches || [])).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, []);
  const players = useMemo(() => [...new Map(matches.flatMap(m => m.players).map(p => [identity(p), p])).values()].sort((a, b) => label(a).localeCompare(label(b), "zh-CN")), [matches]);
  useEffect(() => {
    if (loading || error) return;
    if (selected && !players.some(p => identity(p) === selected)) setSelected("");
    if (competition && !matches.some(m => m.competition === competition)) setCompetition("");
  }, [loading, error, players, matches, selected, competition]);
  const mappings = getNameMappingRows();
  const normalizeName = (s: string) => s.normalize("NFKC").trim().toLowerCase();
  const query = normalizeName(search);
  const options = players.filter(p => {
    const aliases = mappings.filter(m => [m.en, m.zh].some(n => normalizeName(n) === normalizeName(p.player)));
    return normalizeName([p.player, label(p), p.team, ...aliases.flatMap(m => [m.en, m.zh])].join(" ")).includes(query);
  });
  const current = players.find(p => identity(p) === selected);
  const rows = useMemo(() => matches.filter(m => (!competition || m.competition === competition) && (!start || m.date >= start) && (!end || m.date <= end)).flatMap(m => m.players.filter(p => identity(p) === selected).map(p => ({ match: m, player: p }))), [matches, selected, competition, start, end]);
  const columns = [...new Set(rows.flatMap(r => Object.keys(r.player.raw)))].filter(c => rows.some(r => number(r.player.raw[c]) !== null)).sort((a, b) => {
    const ai = reportOrder.indexOf(a), bi = reportOrder.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b, "zh-CN");
  });
  const visible = fields === null ? columns.filter(c => !/高减速次数|平均速度|米\/秒\)/.test(c)) : columns.filter(c => fields.includes(c));
  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true); setError(""); setMessage("");
    try { const r = await importFitnessHistory(files); setMatches(r.matches || []); setMessage(`已处理 ${r.imported} 份文件；当前共 ${r.matches.length} 场比赛。相同比赛重新上传会更新原记录。`); if (r.errors?.length) setError(r.errors.map(e => `${e.filename}：${e.error}`).join("；")); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function exportCsv() {
    const data = [["日期", "赛事", "球队", "对手", "主客", ...visible, "来源文件"], ...rows.map(r => [r.match.date, r.match.competition, r.player.team, r.player.opponent, r.player.side === "home" ? "主场" : "客场", ...visible.map(c => r.player.raw[c] ?? ""), r.match.sourceFile])];
    const csv = "\uFEFF" + data.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `${current?.player || "球员"}_逐场体能.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return <div className="fitness-history">
    <header className="fh-heading"><div><p className="fh-eyebrow">PLAYER MATCH REPORT</p><h1>个人多场体能</h1><p>汇集每一场比赛，专注一名球员的跑动表现。</p></div><label className="fh-upload">{busy ? "正在导入…" : "＋ 批量上传体能 Excel"}<input aria-label="批量上传体能 Excel" type="file" accept=".xlsx" multiple disabled={busy} onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ""; }} /></label></header>
    {error && <p role="alert" className="msg err">{error} <button onClick={load}>重新读取</button></p>}{message && <p role="status" className="msg">{message}</p>}
    <section className="fh-controls">
      <label>搜索球员<input placeholder="例如：泽卡 / Zeca" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>选择球员<select value={selected} onChange={e => { setSelected(e.target.value); }}><option value="">{options.length ? "请选择球员" : "没有匹配球员，请修改搜索词"}</option>{current && !options.some(p => identity(p) === selected) && <option value={selected}>{label(current)} · {current.team}（当前已选）</option>}{options.map(p => <option key={identity(p)} value={identity(p)}>{label(p)} · {p.team}</option>)}</select></label>
      <label>赛事<select value={competition} onChange={e => setCompetition(e.target.value)}><option value="">全部赛事</option>{[...new Set(matches.map(m => m.competition))].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>开始日期<input type="date" onInput={e => setStart(e.currentTarget.value)} value={start} onChange={e => setStart(e.target.value)} /></label><label>结束日期<input type="date" onInput={e => setEnd(e.currentTarget.value)} min={start} value={end} onChange={e => setEnd(e.target.value)} /></label>
    </section>
    {query && options.length === 0 && <p role="status">没有找到“{search.trim()}”。支持原始姓名和姓名对应表中的中英文名称；可输入中文姓名，或补充姓名对应表。<button onClick={() => setSearch("")}>清空搜索</button></p>}
    {loading ? <p className="fh-empty">正在读取比赛…</p> : !current ? <div className="fh-empty"><h2>{matches.length ? "选择一名球员，展开他的比赛记录" : "从多场体能报告开始"}</h2><p>支持一次上传多份标准 PhysicalReport .xlsx，自动汇集主客队球员；数据按当前账号保存。</p><p>已收录 {matches.length} 场比赛 · {players.length} 名球员</p></div> : <>
      <div className="fh-actions"><details><summary>展示指标 · {visible.length} 项</summary><div className="fh-fields"><button type="button" onClick={() => setFields(null)}>恢复默认11项</button>{columns.map(c => <label key={c}><input type="checkbox" checked={visible.includes(c)} onChange={e => setFields(e.target.checked ? [...visible, c] : visible.filter(f => f !== c))} />{c}</label>)}</div></details><button disabled={!rows.length} onClick={exportCsv}>导出明细 CSV</button><button onClick={() => window.print()}>打印 / 保存 PDF</button></div>
      <article className="fh-report"><header className="fh-report-header"><div><p className="fh-eyebrow">个人单场体能记录 · Research</p><h2>{label(current)}</h2><p>{current.team} · {competition || "全部赛事"}</p></div><div className="fh-count"><strong>{rows.length}</strong><span>场比赛</span></div></header>
        <div className="fh-table-scroll"><table style={{ minWidth: 310 + visible.length * 100 }}><colgroup><col style={{ width: 94 }} /><col style={{ width: 60 }} /><col style={{ width: 112 }} /><col style={{ width: 44 }} />{visible.map(c => <col key={c} />)}</colgroup><thead><tr><th>日期</th><th>赛事</th><th>对手</th><th>主客</th>{visible.map(c => <th key={c}><MetricHeader column={c} /></th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.match.id} title={`来源：${r.match.sourceFile} / ${r.player.side === "home" ? "Home" : "Away"} Team Overview；加减速来自 High Accel Decel`}><td>{r.match.date || "未注明"}</td><td>{r.match.competition}</td><td>{r.player.opponent || r.match.match}</td><td>{r.player.side === "home" ? "主" : "客"}</td>{visible.map(c => <td key={c}>{format(number(r.player.raw[c]))}</td>)}</tr>)}</tbody><tfoot><tr><th colSpan={4}>场均值 · 当前筛选比赛</th>{visible.map(c => { const values = rows.map(r => number(r.player.raw[c])).filter((v): v is number => v !== null); return <td key={c} title={`${values.length} 场有效数据`}>{format(values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)}</td>; })}</tr></tfoot></table></div>
        {!rows.length && <p className="fh-empty">当前日期或赛事范围内没有该球员记录。</p>}
        <p className="fh-note">按比赛日期升序排列。各指标直接读取原始表，场均为当前筛选下有效值的算术平均；缺失显示“—”，不按零计算。最快速度的场均表示逐场最快速度的平均值。出场时间保留报告分钟口径（含补时）。</p>
        <details className="fh-sources"><summary>数据来源与指标口径</summary><p>跑动数据：Home / Away Team Overview 原始同名字段；高加速、高减速：对应 High Accel Decel 表（3 至 10 / -3 至 -10 米/秒²）。与参考报告的阈值不作等同换算；未提供的指标不补造。</p>{rows.map(r => <p key={r.match.id}>{r.match.date} · {r.match.sourceFile} · {r.player.sourcePlayer}</p>)}</details>
      </article>
    </>}
  </div>;
}
