import React from "react";

const PILLARS = [
  {
    name: "接应连接",
    description: "衡量在锋线身后接球、传递并把球送向进攻区域的参与程度。",
    metrics: [
      ["接球", "35%"], ["传球", "25%"], ["传入前场三区", "20%"], ["传入禁区", "20%"]
    ]
  },
  {
    name: "机会创造",
    description: "衡量制造最后一传和穿透防线的行为频率，不读取助攻结果。",
    metrics: [
      ["关键传球", "25%"], ["助攻射门传球", "25%"], ["传入禁区", "20%"], ["穿透性传球", "15%"], ["直塞", "15%"]
    ]
  },
  {
    name: "传球推进",
    description: "衡量通过向前输送把进攻从中场推进到前场的倾向。",
    metrics: [
      ["推进传球", "35%"], ["传入前场三区", "25%"], ["向前传球比例", "25%"], ["长传", "15%"]
    ]
  },
  {
    name: "持球推进",
    description: "衡量通过带球、个人对抗和连续推进改变进攻位置的倾向。",
    metrics: [
      ["盘带", "30%"], ["推进跑动", "30%"], ["进攻对抗", "20%"], ["被犯规", "20%"]
    ]
  },
  {
    name: "禁区攻击",
    description: "只描述进入禁区并完成射门的频率，不读取进球和转化效率。",
    metrics: [["禁区触球", "45%"], ["射门", "35%"], ["射门占总行动比例", "20%"]]
  },
  {
    name: "无球纵深",
    description: "衡量向防线身后启动、推进跑动、高速跑量和速度上限。",
    metrics: [["加速次数", "30%"], ["推进跑动", "25%"], ["冲刺距离", "25%"], ["最高速度", "20%"]]
  },
  {
    name: "边肋活动",
    description: "衡量在边线与肋部区域持续形成边路输出的行为倾向。",
    metrics: [["传中", "70%"], ["传入小禁区的传中", "30%"]]
  },
  {
    name: "定位球参与",
    description: "只判断是否承担定位球任务，不代表定位球主罚质量。",
    metrics: [["角球", "55%"], ["任意球", "45%"]]
  }
];

const ROLES = [
  {
    name: "古典前腰",
    core: "机会创造和接应连接的几何均值",
    support: "传球推进、定位球参与、持球推进",
    formula: "60%×√(机会创造×接应连接) + 20%×传球推进 + 12%×定位球参与 + 8%×持球推进"
  },
  {
    name: "影锋",
    core: "禁区攻击和无球纵深的几何均值",
    support: "持球推进、接应连接、机会创造",
    formula: "65%×√(禁区攻击×无球纵深) + 20%×持球推进 + 10%×接应连接 + 5%×机会创造"
  },
  {
    name: "边前腰",
    core: "边肋活动和机会创造的几何均值",
    support: "持球推进、传球推进、接应连接",
    formula: "60%×√(边肋活动×机会创造) + 20%×持球推进 + 15%×传球推进 + 5%×接应连接"
  }
];

function AttackingMidfielderArchetypeMethod() {
  return (
    <>
      <div className="scout-role-archetype-divider">
        <span>前腰额外算法</span>
        <h2>三类前腰独立职责相似度</h2>
        <p>以下部分独立于职责能力分，只回答球员主要在做哪些前腰工作。</p>
      </div>

      <section className="scout-method-flow" aria-label="前腰职责相似度流程">
        {["原始数据", "行为占比与绝对数量", "八个中文行为支柱", "三类独立相似度", "职责标签与可信度"].map((step, index) => (
          <React.Fragment key={step}>
            <div><b>{index + 1}</b><span>{step}</span></div>
            {index < 4 ? <i aria-hidden="true">→</i> : null}
          </React.Fragment>
        ))}
      </section>

      <section className="scout-method-split">
        <article className="scout-method-card scout-method-card-accent">
          <span className="scout-method-number">01</span>
          <div>
            <h2>行为占比和绝对数量同时保留</h2>
            <p>事件型行为先计算其占总行动比例，再与每90分钟绝对数量合成。</p>
            <div className="scout-method-formula">单项行为得分：行为占比百分位70%，每90分钟数量百分位30%</div>
            <ol>
              <li><b>优先分母：</b>源表每90分钟总行动。</li>
              <li><b>其次分母：</b>源表总行动按分钟换算。</li>
              <li><b>回退分母：</b>传球、对抗、盘带和射门之和。</li>
            </ol>
          </div>
        </article>
        <article className="scout-method-card">
          <span className="scout-method-number">02</span>
          <div>
            <h2>行为相似度不读取完成质量</h2>
            <ul>
              <li>进球、助攻、成功率、xG和xA不直接进入八个行为支柱。</li>
              <li>冲刺距离和最高速度直接读取同位置百分位，不除以总行动。</li>
              <li>角球和任意球采用稀疏事件百分位，不除以总行动。</li>
              <li>缺失字段不填零，按可用权重重算并降低字段覆盖率。</li>
            </ul>
          </div>
        </article>
      </section>

      <section className="scout-method-section">
        <div className="scout-method-section-head">
          <div><span className="scout-method-number">03</span><h2>形成 8 个行为支柱</h2></div>
          <p>支柱分 = 可用特征百分位按支柱内权重计算的加权平均</p>
        </div>
        <div className="scout-method-pillar-grid">
          {PILLARS.map((pillar) => (
            <article key={pillar.name}>
              <h3>{pillar.name}</h3>
              <p>{pillar.description}</p>
              <ul>{pillar.metrics.map(([name, weight]) => <li key={name}><span>{name}</span><b>{weight}</b></li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="scout-method-section">
        <div className="scout-method-section-head">
          <div><span className="scout-method-number">04</span><h2>分别计算三类职责相似度</h2></div>
          <p>八个支柱用于完整描述行为，但每项职责只读取自己的必要核心和辅助证据。</p>
        </div>
        <div className="scout-method-table-wrap">
          <table className="scout-method-table">
            <thead><tr><th>职责</th><th>必要核心</th><th>辅助证据</th><th>相似度计算方式</th></tr></thead>
            <tbody>{ROLES.map((role) => <tr key={role.name}><th>{role.name}</th><td>{role.core}</td><td>{role.support}</td><td>{role.formula}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="scout-method-formula">几何均值约束必要核心短板；三个职责各自得到0至100分，互不挤占，也不要求合计100。</div>
      </section>

      <section className="scout-method-split">
        <article className="scout-method-card">
          <span className="scout-method-number">05</span>
          <div>
            <h2>职责边界</h2>
            <ul>
              <li><b>古典前腰：</b>必须同时高频接应和制造机会，单靠定位球不能抬高结论。</li>
              <li><b>影锋：</b>必须同时形成禁区攻击和无球纵深，进球结果只在能力分中评价。</li>
              <li><b>边前腰：</b>必须同时存在边肋活动和创造行为，单纯传中多不会自动归类。</li>
              <li>定位球只辅助古典前腰识别，不替代开放比赛组织行为。</li>
            </ul>
          </div>
        </article>
        <article className="scout-method-card">
          <span className="scout-method-number">06</span>
          <div>
            <h2>职责标签怎么确定</h2>
            <p>系统保留最高和第二相似度，默认只显示一个主职责；只有双高分且几乎并列时显示复合型。</p>
            <div className="scout-method-thresholds">
              <div><b>两项均不低于70且差不超过3分</b><span>允许显示双职责</span></div>
              <div><b>或两项均不低于65且差不超过2分</b><span>允许显示中高强度双职责</span></div>
              <div><b>最高相似度不低于45</b><span>显示一个主职责</span></div>
              <div><b>最高相似度低于45</b><span>显示职责特征不突出</span></div>
            </div>
            <div className="scout-method-formula">职责区分度 = min（1，第一与第二相似度之差 ÷ 20）</div>
          </div>
        </article>
      </section>

      <section className="scout-method-section scout-method-confidence">
        <div className="scout-method-section-head">
          <div><span className="scout-method-number">07</span><h2>数据可信度与职责区分度</h2></div>
          <p>数据可信度回答现有数据是否足够；职责区分度回答第一和第二职责是否容易区分。</p>
        </div>
        <div className="scout-method-confidence-grid">
          <div><b>字段覆盖率</b><span>8个支柱中实际可用特征权重的平均覆盖程度</span></div>
          <strong>×</strong>
          <div><b>分钟可靠度</b><span>min（1，出场分钟 ÷ 满可靠度分钟）</span></div>
          <strong>×</strong>
          <div><b>位置可靠度</b><span>AMF为第一、第二、第三及以后位置：100%、75%、55%</span></div>
          <strong>=</strong>
          <div><b>数据可信度</b><span>三项相乘，不因复合型而被压低</span></div>
        </div>
        <div className="scout-method-formula">数据可信度 = 字段覆盖率 × 分钟可靠度 × 位置可靠度</div>
        <small>数据可信度和职责区分度都不参与职责能力分或职责相似度。</small>
      </section>

      <section className="scout-method-notes">
        <div><h2>如何理解当前职责相似度</h2><p>它表示球员在页面当前所选职责中的行为相似程度，不一定是三类职责中的最高分，也不会改变能力排名。</p></div>
        <div>
          <h2>使用边界</h2>
          <ul>
            <li>这是Research口径，需通过熟悉球员样本继续校准。</li>
            <li>相似度是同位置群体内的相对行为结构，不是跨联赛绝对能力。</li>
            <li>只有位置记录明确包含AMF才进入前腰比较池；RAMF、LAMF不能单独触发前腰资格。</li>
            <li>源表是多位置整季合计数据；前腰不是第一位置时只作较低可信度参考。</li>
            <li>字段不足时显示数据不足，不强行归类。</li>
          </ul>
        </div>
      </section>
    </>
  );
}

export default AttackingMidfielderArchetypeMethod;
