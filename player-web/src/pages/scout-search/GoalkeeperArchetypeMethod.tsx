import React from "react";
import type { DefenderMethodDefinition } from "./DefenderArchetypeMethod";

export default function GoalkeeperArchetypeMethod({ method }: { method: DefenderMethodDefinition }) {
  return <>
    <div className="scout-role-archetype-divider"><span>门将额外算法</span><h2>两类门将独立职责相似度</h2><p>类型描述参与方式，能力分评价完成质量；两类得分互不挤占，不要求合计100。</p></div>
    <section className="scout-method-flow" aria-label="门将职责相似度流程">
      {["门将原始字段", "每90分钟与传球结构", "八个行为支柱", "两类独立相似度", "标签与可信度"].map((name, i) => <React.Fragment key={name}><div><b>{i+1}</b><span>{name}</span></div>{i < 4 ? <i aria-hidden="true">→</i> : null}</React.Fragment>)}
    </section>
    <section className="scout-method-split">
      <article className="scout-method-card scout-method-card-accent"><span className="scout-method-number">01</span><div><h2>只与门将比较</h2><p>位置须包含独立GK标记。每90分钟数量与传球结构比例直接计算门将池标准百分位，不套用外场总行动分母。</p><div className="scout-method-formula">短中传占比 = 实际短中传次数 ÷ 总传球次数；直接处理占比 = 长传次数 ÷ 总传球次数</div><p>传球须大于0，短中传或长传不能超过总传球；来源缺失或不一致则对应特征缺失，不补零，不用传球减长传替代短中传。接回传专属字段不再参与类型识别。</p></div></article>
      <article className="scout-method-card"><span className="scout-method-number">02</span><div><h2>行为与能力分开</h2><ul><li>扑救率、预防失球、传球成功率不进入类型识别。</li><li>被射门只描述应对负荷，不能当作能力奖励。</li><li>每个特征至少8个有效门将样本；缺失按可用权重重算并降低覆盖率。</li><li>不按最高速度、冲刺距离推断门将站位。</li></ul></div></article>
    </section>
    <section className="scout-method-section">
      <div className="scout-method-section-head"><div><span className="scout-method-number">03</span><h2>形成 8 个行为支柱</h2></div><p>支柱分 = 可用特征百分位的加权平均；字段覆盖程度单独保留。</p></div>
      <div className="scout-method-pillar-grid">{method.pillars.map(p => <article key={p.id}><h3>{p.name}</h3><p>{p.description}</p><ul>{p.metrics.map(m => <li key={m.name}><span>{m.name}</span><b>{m.weight}%</b></li>)}</ul></article>)}</div>
    </section>
    <section className="scout-method-section">
      <div className="scout-method-section-head"><div><span className="scout-method-number">04</span><h2>计算两类独立职责相似度</h2></div><p>必要核心使用几何均值，辅助项不能替代核心。</p></div>
      <div className="scout-method-table-wrap"><table className="scout-method-table"><thead><tr><th>职责</th><th>必要核心</th><th>辅助证据</th><th>相似度公式</th></tr></thead><tbody>{method.roles.map(r => <tr key={r.id}><th>{r.name}</th><td>{r.core}</td><td>{r.support}</td><td>{r.formula}</td></tr>)}</tbody></table></div>
    </section>
    <section className="scout-method-split">
      <article className="scout-method-card"><span className="scout-method-number">05</span><div><h2>职责边界</h2><ul>{method.roles.map(r => <li key={r.id}><b>{r.name}：</b>{r.boundary}</li>)}<li>至少4个支柱可用，必要核心齐备且有实质行为、职责证据覆盖至少70%才通过准入。未通过时排名显示“未达标”。</li><li>扑救型是直接处理与较少组织参与的代理，不证明扑救质量或低位站位；被射门只作5%辅助，缺少该字段不阻止判断。</li></ul></div></article>
      <article className="scout-method-card"><span className="scout-method-number">06</span><div><h2>职责标签怎么确定</h2><div className="scout-method-thresholds"><div><b>双项至少70且差至多3分</b><span>允许复合型</span></div><div><b>或双项至少65且差至多2分</b><span>允许中高强度复合型</span></div><div><b>最高分至少45</b><span>默认一个主职责，不强设人数配额</span></div><div><b>核心缺失或最高分低于45</b><span>分别显示数据不足或职责特征不突出</span></div></div><div className="scout-method-formula">职责区分度 = 第一与第二相似度差 ÷ 20，上限100%</div></div></article>
    </section>
    <section className="scout-method-section scout-method-confidence">
      <div className="scout-method-section-head"><div><span className="scout-method-number">07</span><h2>数据可信度与职责区分度</h2></div><p>数据充分不代表已控制球队环境。</p></div>
      <div className="scout-method-confidence-grid"><div><b>字段覆盖率</b><span>八个支柱可用权重的平均覆盖率</span></div><strong>×</strong><div><b>分钟可靠度</b><span>出场分钟 ÷ 满可靠度分钟，上限100%</span></div><strong>×</strong><div><b>位置可靠度</b><span>GK第一、第二、第三及以后：100%、75%、55%</span></div><strong>=</strong><div><b>数据可信度</b><span>不因复合型而压低，不参与评分</span></div></div>
      <div className="scout-method-formula">能力分、职责相似度、数据可信度分别展示；职责区分度只解释两类是否接近。</div>
    </section>
    <section className="scout-method-notes"><div><h2>Research使用边界</h2><p>源表缺少射门落点质量、受压传球、出击坐标、摘传中成功率及球队控球环境。预防失球直接读取源字段，不假设其等于PSxG；失球和零封不直接计分。不凭空构造反应、指挥、脚下抗压或清道夫能力。</p></div><div><h2>人工复核</h2><p>选取熟悉门将结合录像、活动区域和球队打法验证，再调整通用权重。少于8名有效门将或必要字段不足时，不把类型或能力榜当作招募结论。</p><p>职责拆分参考<a href="https://www.fifatrainingcentre.com/en/resources-tools/football-language/goalkeeping/index.php" target="_blank" rel="noreferrer">FIFA门将职责说明</a>；具体权重为本项目Research先验，并非FIFA评分公式。</p></div></section>
  </>;
}
