import React from "react";

const PILLARS = [
  {
    name: "覆盖跑动",
    description: "衡量持续覆盖、较高强度跑动和反复参与比赛的行为倾向。",
    metrics: [["总距离", "35%"], ["高强度距离", "25%"], ["每分钟跑动距离", "20%"], ["冲刺距离", "10%"], ["加速次数", "10%"]]
  },
  {
    name: "防守参与",
    description: "衡量主动进入防守回合、对抗持球人和夺回球权的频率，不读取成功率。",
    metrics: [["成功防守动作", "35%"], ["防守对抗", "25%"], ["调整后拦截", "20%"], ["调整后铲球", "10%"], ["封堵射门", "10%"]]
  },
  {
    name: "身体参与",
    description: "描述球员主动进入身体接触和不同类型对抗的行为结构，不评价完成质量。",
    metrics: [["对抗", "40%"], ["空中对抗", "25%"], ["进攻对抗", "25%"], ["被犯规", "10%"]]
  },
  {
    name: "持球推进",
    description: "衡量通过盘带、推进跑动和进攻对抗把球带过中场线的倾向。",
    metrics: [["推进跑动", "35%"], ["盘带", "30%"], ["进攻对抗", "20%"], ["被犯规", "15%"]]
  },
  {
    name: "传球推进",
    description: "衡量通过向前与越线传球把进攻送入前场和危险区域的倾向。",
    metrics: [["推进传球", "35%"], ["传入前场三区", "25%"], ["传入禁区", "15%"], ["向前传球比例", "15%"], ["长传", "10%"]]
  },
  {
    name: "控球连接",
    description: "衡量在中场持续接应、传递和维持球队控球链条的参与程度。",
    metrics: [["传球", "40%"], ["接球", "35%"], ["长传", "15%"], ["推进传球", "10%"]]
  },
  {
    name: "机会创造",
    description: "衡量制造最后一传和穿透防线的行为频率，不读取助攻或预期助攻结果。",
    metrics: [["关键传球", "25%"], ["助攻射门传球", "25%"], ["穿透性传球", "20%"], ["直塞", "15%"], ["传入禁区", "15%"]]
  },
  {
    name: "后插上威胁",
    description: "衡量从中场进入禁区、完成射门以及形成高质量射门位置的威胁。",
    metrics: [["禁区触球", "45%"], ["射门", "30%"], ["每90分钟预期进球（xG）", "15%"], ["加速次数", "10%"]]
  }
];

const ROLES = [
  {
    name: "全场覆盖型（B2B）中场",
    core: "覆盖跑动与攻防两端参与的嵌套几何核心",
    support: "持球推进、传球推进、身体参与",
    formula: "55%×√(覆盖跑动×√(防守参与×后插上威胁)) + 20%×持球推进 + 15%×传球推进 + 10%×身体参与"
  },
  {
    name: "推进型中场",
    core: "持球推进和传球推进的几何均值",
    support: "控球连接、机会创造、后插上威胁",
    formula: "65%×√(持球推进×传球推进) + 15%×控球连接 + 10%×机会创造 + 10%×后插上威胁"
  },
  {
    name: "组织核心",
    core: "控球连接和传球推进的几何均值",
    support: "机会创造、持球推进、覆盖跑动",
    formula: "60%×√(控球连接×传球推进) + 25%×机会创造 + 10%×持球推进 + 5%×覆盖跑动"
  }
];

function CentralMidfielderArchetypeMethod() {
  return (
    <>
      <div className="scout-role-archetype-divider">
        <span>中前卫额外算法</span>
        <h2>三类中前卫独立职责相似度</h2>
        <p>以下部分独立于职责能力分，只回答球员主要在做哪些中前卫工作。</p>
      </div>

      <section className="scout-method-flow" aria-label="中前卫职责相似度流程">
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
            <h2>职责相似度以行为为主，保留xG例外</h2>
            <ul>
              <li>进球、助攻、成功率和xA不直接进入八个行为支柱；后插上威胁单独读取每90分钟xG，作为射门位置质量的代理证据。</li>
              <li>跑动距离、每分钟距离及调整后防守数据直接读取同位置百分位。</li>
              <li>缺失字段不填零，按可用权重重算并降低字段覆盖率。</li>
              <li>能力评分仍独立评价成功率、量效耦合、产出和尖点表现。</li>
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
          <p>八个支柱完整描述行为，每项职责只读取自己的必要核心和辅助证据。</p>
        </div>
        <div className="scout-method-table-wrap">
          <table className="scout-method-table">
            <thead><tr><th>职责</th><th>必要核心</th><th>辅助证据</th><th>相似度计算方式</th></tr></thead>
            <tbody>{ROLES.map((role) => <tr key={role.name}><th>{role.name}</th><td>{role.core}</td><td>{role.support}</td><td>{role.formula}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="scout-method-formula">必要核心使用几何均值约束短板；三个职责分别得到0至100分，互不挤占，也不要求合计100。</div>
      </section>

      <section className="scout-method-split">
        <article className="scout-method-card">
          <span className="scout-method-number">05</span>
          <div>
            <h2>职责边界</h2>
            <ul>
              <li><b>全场覆盖型：</b>覆盖跑动必须同时得到防守参与和后插上行为支持，单纯跑得多不够。</li>
              <li><b>推进型：</b>持球与传球两条推进路径都需要存在，避免只会其中一种就得到过高相似度。</li>
              <li><b>组织核心：</b>控球连接与向前输送必须同时成立，机会创造用于强化而不能替代组织参与。</li>
              <li>除后插上威胁中的xG/90代理外，完成质量、成功率和结果产出仍统一留在职责能力分中评价。</li>
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
          <div><b>位置可靠度</b><span>中前卫为第一、第二、第三及以后位置：100%、75%、55%</span></div>
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
            <li>只有位置记录明确包含RCMF、LCMF或CMF才进入中前卫比较池。</li>
            <li>源表是多位置整季合计数据；中前卫不是第一位置时只作较低可信度参考。</li>
            <li>字段不足时显示数据不足，不强行归类。</li>
          </ul>
        </div>
      </section>
    </>
  );
}

export default CentralMidfielderArchetypeMethod;
