import React from "react";

const WINGER_PILLARS = [
  {
    name: "边路传中",
    description: "衡量传中在开放比赛行为中的占用程度和实际传中量。",
    metrics: [
      { name: "每90分钟传中及其总行动占比", weight: "70%" },
      { name: "每90分钟传入小禁区的传中及其总行动占比", weight: "30%" }
    ]
  },
  {
    name: "持球突破",
    description: "强调盘带和推进跑动，进攻对抗与被犯规作为辅助证据。",
    metrics: [
      { name: "盘带", weight: "40%" },
      { name: "推进跑动", weight: "30%" },
      { name: "进攻对抗", weight: "20%" },
      { name: "被犯规", weight: "10%" }
    ]
  },
  {
    name: "禁区威胁",
    description: "只描述进入禁区和完成射门的行为频率，不读取进球结果。",
    metrics: [{ name: "禁区触球", weight: "55%" }, { name: "射门", weight: "45%" }]
  },
  {
    name: "纵深冲击",
    description: "衡量向前带动、启动频率、高速跑量和速度上限。",
    metrics: [
      { name: "推进跑动", weight: "20%" },
      { name: "加速次数", weight: "30%" },
      { name: "冲刺距离", weight: "30%" },
      { name: "最高速度", weight: "20%" }
    ]
  },
  {
    name: "机会创造",
    description: "衡量在开放比赛中制造最后一传和穿透防线的行为频率。",
    metrics: [
      { name: "关键传球", weight: "30%" },
      { name: "助攻射门传球", weight: "25%" },
      { name: "传入禁区", weight: "20%" },
      { name: "穿透性传球", weight: "15%" },
      { name: "直塞", weight: "10%" }
    ]
  },
  {
    name: "连接参与",
    description: "衡量传接、长距离输送和把球推进到前场区域的参与程度。",
    metrics: [
      { name: "传球", weight: "10%" },
      { name: "接球", weight: "10%" },
      { name: "长传", weight: "18%" },
      { name: "推进传球", weight: "25%" },
      { name: "传入前场三区", weight: "22%" },
      { name: "向前传球比例", weight: "15%" }
    ]
  },
  {
    name: "跑动防守",
    description: "衡量防守行动与无球覆盖；权重较低，避免球队战术主导职责。",
    metrics: [
      { name: "防守对抗", weight: "40%" },
      { name: "成功防守动作", weight: "35%" },
      { name: "总跑动距离", weight: "25%" }
    ]
  },
  {
    name: "定位球参与",
    description: "只判断是否承担定位球任务，不代表主罚质量。",
    metrics: [{ name: "角球", weight: "55%" }, { name: "任意球", weight: "45%" }]
  }
];

const WINGER_ROLES = [
  {
    name: "顺足下底边锋",
    core: "边路传中和持球突破的几何均值",
    support: "纵深冲击、跑动防守",
    formula: "65%×√(边路传中×持球突破) + 25%×纵深冲击 + 10%×跑动防守"
  },
  {
    name: "逆足内切型边锋",
    core: "持球突破与禁区威胁、机会创造均值的几何均值",
    support: "机会创造、纵深冲击",
    formula: "60%×√(持球突破×平均(禁区威胁,机会创造)) + 25%×机会创造 + 15%×纵深冲击"
  },
  {
    name: "内锋",
    core: "禁区威胁和纵深冲击的几何均值",
    support: "持球突破、跑动防守",
    formula: "65%×√(禁区威胁×纵深冲击) + 25%×持球突破 + 10%×跑动防守"
  },
  {
    name: "组织型边锋",
    core: "机会创造和连接参与的几何均值",
    support: "持球突破、定位球参与",
    formula: "65%×√(机会创造×连接参与) + 20%×持球突破 + 15%×定位球参与"
  }
];

function WingerArchetypeMethod() {
  return (
    <>
      <div className="scout-role-archetype-divider">
        <span>边锋额外算法</span>
        <h2>四类边锋独立职责相似度</h2>
        <p>以下部分独立于职责能力分，只回答球员主要在做哪些边锋工作。</p>
      </div>

      <section className="scout-method-flow" aria-label="边锋职责相似度流程">
        {[
          "原始数据",
          "行为占比与绝对数量",
          "八个中文行为支柱",
          "四类独立相似度",
          "职责标签与可信度"
        ].map((step, index) => (
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
            <h2>连续体能和定位球单独处理</h2>
            <ul>
              <li>冲刺距离和最高速度直接读取同位置百分位，不除以总行动。</li>
              <li>角球和任意球采用稀疏事件百分位，不除以总行动。</li>
              <li>缺失字段不填零，按可用权重重算，同时降低字段覆盖率。</li>
              <li>单项有效样本少于8人时不参与支柱计算。</li>
            </ul>
          </div>
        </article>
      </section>

      <section className="scout-method-section">
        <div className="scout-method-section-head">
          <div><span className="scout-method-number">03</span><h2>形成 8 个行为支柱</h2></div>
          <p>支柱分 = Σ（可用特征百分位 × 特征权重）÷ Σ（可用特征权重）</p>
        </div>
        <div className="scout-method-pillar-grid">
          {WINGER_PILLARS.map((pillar) => (
            <article key={pillar.name}>
              <h3>{pillar.name}</h3>
              <p>{pillar.description}</p>
              <ul>
                {pillar.metrics.map((metric) => (
                  <li key={metric.name}><span>{metric.name}</span><b>{metric.weight}</b></li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="scout-method-section">
        <div className="scout-method-section-head">
          <div><span className="scout-method-number">04</span><h2>分别计算四类职责相似度</h2></div>
          <p>八个支柱用于完整描述行为，但每项职责只读取自己的必要核心和辅助证据。</p>
        </div>
        <div className="scout-method-table-wrap">
          <table className="scout-method-table">
            <thead><tr><th>职责</th><th>必要核心</th><th>辅助证据</th><th>相似度计算方式</th></tr></thead>
            <tbody>
              {WINGER_ROLES.map((role) => (
                <tr key={role.name}><th>{role.name}</th><td>{role.core}</td><td>{role.support}</td><td>{role.formula}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="scout-method-formula">
          几何均值用于约束核心短板：必要行为中任何一项明显偏低，其他无关支柱不能把该职责分数完全补回来。四项职责仍各自得到独立的0到100分，不要求合计100。
        </div>
      </section>

      <section className="scout-method-split">
        <article className="scout-method-card">
          <span className="scout-method-number">05</span>
          <div>
            <h2>左右活动侧与惯用脚</h2>
            <p>位置记录是主要依据，左右路传中来源用于佐证，不直接提高传中支柱分。</p>
            <ul>
              <li>单侧位置明确时：位置记录占70%，左右路传中来源占30%。</li>
              <li>左右位置都出现时：以平滑后的左右路传中比例识别主要活动侧，并降低可信度。</li>
              <li>活动侧与惯用脚相同支持顺足下底；相反支持逆足内切。</li>
              <li>足侧未知、左右侧不明或两者冲突时保留相似度，但标记待确认或降低可信度。</li>
            </ul>
          </div>
        </article>
        <article className="scout-method-card">
          <span className="scout-method-number">06</span>
          <div>
            <h2>职责标签规则</h2>
            <div className="scout-method-thresholds">
              <div><b>两项均不低于70且相差不超过3分</b><span>允许双职责</span></div>
              <div><b>或两项均不低于65且相差不超过2分</b><span>允许中高分双职责</span></div>
              <div><b>最高相似度不低于45</b><span>默认显示一个主职责</span></div>
              <div><b>最高相似度低于45</b><span>显示职责特征不突出</span></div>
            </div>
          </div>
        </article>
      </section>

      <section className="scout-method-section scout-method-confidence">
        <div className="scout-method-section-head">
          <div><span className="scout-method-number">07</span><h2>数据可信度与职责区分度</h2></div>
          <p>两项只解释判断边界，不参与职责能力分或职责相似度。</p>
        </div>
        <div className="scout-method-formula">
          数据可信度由字段覆盖、分钟可靠度、位置稳定性、活动侧证据和足侧完整性共同决定。<br />
          职责区分度由第一与第二相似度的差距决定。
        </div>
      </section>
    </>
  );
}

export default WingerArchetypeMethod;
