import React from "react";

const PILLARS = [
  {
    name: "防线保护",
    description: "衡量在防线身前拦截线路并参与低位地面与空中对抗的行为频率，封堵射门只作少量补充。",
    metrics: [["PAdj拦截", "30%"], ["封堵射门", "10%"], ["防守对抗", "35%"], ["空中对抗", "25%"]]
  },
  {
    name: "夺回球权",
    description: "衡量主动进入夺回球权回合的倾向，不读取对抗成功率。",
    metrics: [["成功防守动作", "35%"], ["防守对抗", "30%"], ["PAdj滑铲", "25%"], ["PAdj拦截", "10%"]]
  },
  {
    name: "身体参与",
    description: "描述进入身体接触、地面对抗和空中对抗的行为结构，不评价完成质量。",
    metrics: [["对抗", "40%"], ["空中对抗", "30%"], ["防守对抗", "20%"], ["被犯规", "10%"]]
  },
  {
    name: "覆盖跑动",
    description: "衡量防线身前的持续覆盖与较高强度移动。",
    metrics: [["总距离", "55%"], ["高强度距离", "45%"]]
  },
  {
    name: "转换保护",
    description: "衡量丢球后的快速回追与加速补位倾向，不重复读取防守对抗。",
    metrics: [["冲刺距离", "50%"], ["加速次数", "50%"]]
  },
  {
    name: "接应推进",
    description: "把接应出球与传球推进合并，衡量持续提供接应点并把球向前送出压力线的程度。",
    metrics: [["传球", "15%"], ["接球", "15%"], ["推进传球", "25%"], ["向前传球", "10%"], ["向前传球比例", "20%"], ["传入前场三区", "15%"]]
  },
  {
    name: "长传调度",
    description: "衡量通过长距离输送改变进攻方向与跨线推进的行为倾向。",
    metrics: [["长传", "40%"], ["长传占总传球比例", "30%"], ["平均传球长度", "20%"], ["推进传球", "10%"]]
  },
  {
    name: "中卫兼容性",
    description: "直接读取位置记录：同时包含后腰与中卫记100分；只有后腰位置保留20分基准，不再用回传或封堵猜测空间站位。",
    metrics: [["后腰与中卫双位置兼容", "100%"]]
  }
];

const ROLES = [
  {
    name: "拖后组织者",
    core: "接应推进",
    support: "长传调度、防线保护、覆盖跑动",
    formula: "60%×接应推进 + 25%×长传调度 + 10%×防线保护 + 5%×覆盖跑动"
  },
  {
    name: "防守型后腰",
    core: "夺回球权和防线保护的几何均值",
    support: "覆盖跑动、身体参与、接应推进",
    formula: "60%×√(夺回球权×防线保护) + 20%×覆盖跑动 + 15%×身体参与 + 5%×接应推进"
  },
  {
    name: "半中卫",
    core: "中卫兼容性优先",
    support: "接应推进、身体参与、防线保护",
    formula: "40%×中卫兼容性 + 30%×接应推进 + 20%×身体参与 + 10%×防线保护"
  }
];

function DefensiveMidfielderArchetypeMethod() {
  return (
    <>
      <div className="scout-role-archetype-divider">
        <span>后腰额外算法</span>
        <h2>三类后腰独立职责相似度</h2>
        <p>以下部分独立于职责能力分，只回答球员主要在做哪些后腰工作。</p>
      </div>

      <section className="scout-method-flow" aria-label="后腰职责相似度流程">
        {["原始数据", "行为占比与绝对数量", "八个职责证据支柱", "三类独立相似度", "职责标签与可信度"].map((step, index) => (
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
            <h2>职责相似度以行为为主，半中卫增加位置结构证据</h2>
            <ul>
              <li>成功率、进球、助攻和最终能力分不进入七个行为支柱。</li>
              <li>PAdj拦截、PAdj滑铲、跑动距离和平均传球长度直接读取同位置百分位。</li>
              <li>半中卫额外读取后腰与中卫位置兼容性；这是职责结构证据，不是能力评价。</li>
              <li>缺失字段不填零，按可用权重重算并降低字段覆盖率。</li>
              <li>量效耦合、完成质量和尖点表现仍由上方职责能力分评价。</li>
            </ul>
          </div>
        </article>
      </section>

      <section className="scout-method-section">
        <div className="scout-method-section-head">
          <div><span className="scout-method-number">03</span><h2>形成 8 个职责证据支柱</h2></div>
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
          <p>七个行为支柱加一个位置结构支柱；每项职责只读取自己的必要核心和辅助证据。</p>
        </div>
        <div className="scout-method-table-wrap">
          <table className="scout-method-table">
            <thead><tr><th>职责</th><th>必要核心</th><th>辅助证据</th><th>相似度计算方式</th></tr></thead>
            <tbody>{ROLES.map((role) => <tr key={role.name}><th>{role.name}</th><td>{role.core}</td><td>{role.support}</td><td>{role.formula}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="scout-method-formula">防守型后腰的双核心使用几何均值约束短板；半中卫优先读取中卫兼容性。三个职责分别得到0至100分，互不挤占，也不要求合计100。</div>
      </section>

      <section className="scout-method-split">
        <article className="scout-method-card">
          <span className="scout-method-number">05</span>
          <div>
            <h2>职责边界</h2>
            <ul>
              <li><b>拖后组织者：</b>必须同时有持续接应和向前输送，长传用于强化调度特征，不能用传球量单独替代。</li>
              <li><b>防守型后腰：</b>主动夺回球权和防线保护必须同时存在，单纯跑动或对抗多不够。</li>
              <li><b>半中卫：</b>先看球员是否同时具备后腰与中卫位置记录，再看接应推进、身体参与和防线保护。</li>
              <li>只有后腰位置时保留20分兼容基准，不会被绝对排除，但不能获得双位置强证据。</li>
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
              <div><b>或两项均不低于65且差不超过2分</b><span>允许中高强度双职责</span></div>
              <div><b>最高相似度不低于45</b><span>默认显示一个主职责</span></div>
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
          <div><b>位置可靠度</b><span>后腰为第一、第二、第三及以后位置：100%、75%、55%</span></div>
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
            <li>这是Research口径，需要通过熟悉球员样本继续校准。</li>
            <li>只有位置记录明确包含DMF、RDMF或LDMF才进入后腰比较池。</li>
            <li>纯中卫或纯中前卫不会因为某项代理数据相似而进入后腰排名。</li>
            <li>中卫兼容性来自位置记录，不代表已验证其真实回撤路径；半中卫结论仍需结合录像复核。</li>
            <li>字段不足时显示数据不足，不强行归类。</li>
          </ul>
        </div>
      </section>
    </>
  );
}

export default DefensiveMidfielderArchetypeMethod;
