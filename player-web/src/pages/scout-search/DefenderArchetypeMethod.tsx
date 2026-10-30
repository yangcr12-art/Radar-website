import React from "react";

export type DefenderMethodDefinition = {
  family: string;
  positionTokens: string[];
  compatibilityRules: string[];
  adjustmentRules?: string[];
  attackStyleRules?: string[];
  pillars: Array<{ id: string; name: string; description: string; metrics: Array<{ name: string; weight: number }> }>;
  roles: Array<{ id: string; name: string; core: string; support: string; formula: string; boundary: string }>;
};

function DefenderArchetypeMethod({ method }: { method: DefenderMethodDefinition }) {
  const isFullback = method.family === "边后卫";
  const PILLARS = method.pillars;
  const ROLES = method.roles;
  return (
    <>
      <div className="scout-role-archetype-divider">
        <span>{method.family}额外算法</span>
        <h2>{ROLES.length}类{method.family}独立职责相似度</h2>
        <p>以下部分独立于职责能力分，使用行为证据与位置结构判断职责匹配，不评价完成质量。</p>
      </div>

      <section className="scout-method-flow" aria-label={`${method.family}职责相似度流程`}>
        {["原始数据", "行为与位置结构证据", isFullback ? "八个职责证据支柱" : "七个行为支柱与位置说明", `${ROLES.length}类独立相似度`, "职责标签与可信度"].map((step, index) => (
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
            <h2>职责相似度以行为为主</h2>
            <ul>
              <li>对抗成功率、传球成功率、进球和助攻结果不进入行为相似度。</li>
              <li>拦截、成功防守动作等结果型字段只作现有数据下的代理，不能证明真实站位。</li>
              <li>事件行为占比占70%，每90分钟量占30%；距离、速度和PAdj字段直接使用普通百分位。</li>
              <li>单项至少8个有效样本；缺失不填零，按可用权重重算并降低覆盖率。</li>
              <li>{isFullback ? "第八支柱为边翼卫位置支持：使用绝对规则分，不计算群体百分位。" : "第八张卡片只说明居中与边中卫位置兼容性，不生成数值分，不参与职责相似度和字段覆盖率。"}</li>
              <li>量效耦合、完成质量和逐指标尖点表现由职责能力分评价。</li>
            </ul>
          </div>
        </article>
      </section>

      <section className="scout-method-section">
        <div className="scout-method-section-head">
          <div><span className="scout-method-number">03</span><h2>{isFullback ? "形成 8 个职责证据支柱" : "形成七个行为支柱与位置兼容性说明"}</h2></div>
          <p>{isFullback ? "前七项按可用特征百分位加权；第八项读取翼卫方向支持规则分。" : "七个行为支柱按可用特征百分位加权；位置兼容性只作说明与筛选。"}</p>
        </div>
        <div className="scout-method-pillar-grid">
          {PILLARS.map((pillar) => (
            <article key={pillar.name}>
              <h3>{pillar.name}</h3>
              <p>{pillar.description}</p>
              <ul>{!isFullback && pillar.id === "wide_cb_compatibility" ? method.compatibilityRules.map((rule) => <li key={rule}>{rule}</li>) : pillar.metrics.map((metric) => <li key={metric.name}><span>{metric.name}</span><b>{metric.weight}%</b></li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="scout-method-section">
        <div className="scout-method-section-head">
          <div><span className="scout-method-number">04</span><h2>分别计算{ROLES.length}类职责相似度</h2></div>
          <p>每项职责只读取自己的必要核心和辅助证据，不将八支柱全部平均使用。</p>
        </div>
        <div className="scout-method-table-wrap">
          <table className="scout-method-table">
            <thead><tr><th>职责</th><th>必要核心</th><th>辅助证据</th><th>相似度计算方式</th></tr></thead>
            <tbody>{ROLES.map((role) => <tr key={role.name}><th>{role.name}</th><td>{role.core}</td><td>{role.support}</td><td>{role.formula}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="scout-method-formula">几何均值用于约束必要核心的短板；例如两个核心分别为90和10，核心组合是30而不是50。{ROLES.length}个职责分别得到0至100分，互不挤占，不要求合计100。{isFullback ? "位置结构证据不足时仍显示诊断分，但不参与主标签竞争。" : "居中和边中卫兼容性均不参与计分。"}</div>
        {method.adjustmentRules?.length ? <ul>{method.adjustmentRules.map((rule) => <li key={rule}>{rule}</li>)}</ul> : null}
        {method.attackStyleRules?.length ? <div className="scout-method-formula"><b>主职责旁的进攻方式说明（不计分）</b><ul>{method.attackStyleRules.map((rule) => <li key={rule}>{rule}</li>)}</ul></div> : null}
      </section>

      <section className="scout-method-split">
        <article className="scout-method-card">
          <span className="scout-method-number">05</span>
          <div>
            <h2>职责边界</h2>
            <ul>
              {ROLES.map((role) => <li key={role.id}><b>{role.name}：</b>{role.boundary}</li>)}
              {method.compatibilityRules.map((rule) => <li key={rule}>{rule}</li>)}
              <li>{isFullback ? "左路与右路由LB/LWB和RB/RWB位置标记确定。多侧兼容且没有分位置分钟时，不强行指定主侧。" : "按本项目确认的位置编码，LCB确认左侧、RCB确认右侧、CB确认居中兼容。CB不直接加拖后分，不证明持续担任居中中卫或采用五后卫阵型。"}</li>
              <li>{ROLES.length}类职责都保留完整位置族能力榜。侧别和位置兼容性筛选只改变显示，不改变得分、整体排名和百分位基准。</li>
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
          <div><b>字段覆盖率</b><span>{isFullback ? "8个支柱" : "7个行为支柱（不含位置兼容性）"}中实际可用特征权重的平均覆盖程度</span></div>
          <strong>×</strong>
          <div><b>分钟可靠度</b><span>min（1，出场分钟 ÷ 满可靠度分钟）</span></div>
          <strong>×</strong>
          <div><b>位置可靠度</b><span>本位置族为第一、第二、第三及以后位置：100%、75%、55%</span></div>
          <strong>=</strong>
          <div><b>数据可信度</b><span>三项相乘，不因复合型而被压低</span></div>
        </div>
        <div className="scout-method-formula">数据可信度 = 字段覆盖率 × 分钟可靠度 × 位置可靠度</div>
        <small>数据可信度和职责区分度都不参与职责能力分或职责相似度。</small>
      </section>

      <section className="scout-method-notes">
        <div><h2>如何理解当前职责相似度</h2><p>当前职责相似度是所选职责的独立分，不一定是{ROLES.length}类最高分。{isFullback ? "边翼卫综合位置结构与行为，其余三类不读取兼容性。" : "中卫只计算上抢、拖后、出球三项；边中卫为位置兼容性说明及筛选条件。"}未通过准入时榜单显示“未达标”。</p></div>
        <div>
          <h2>使用边界</h2>
          <ul>
            <li>这是Research口径，需要通过熟悉球员样本继续校准。</li>
            <li>候选位置必须明确包含：{method.positionTokens.join("、")}。</li>
            <li>至少4个行为支柱可用，位置兼容性不计入这4项；每种职责的必要核心必须同时可用，不能仅靠位置或辅助证据分类。</li>
            <li>{isFullback ? "攻守均衡表示两端参与结构，不表示两端都完成得好；当前不根据组织数据推断内收站位。" : "上抢和拖后均有空间代理限制，需要活动图和录像复核，不将代理结论当作已验证战术事实。"}</li>
            <li>公式和支柱权重直接读取后端计算配置，避免说明页与评分逻辑分叉。</li>
            <li>字段不足时显示数据不足，不强行归类。</li>
          </ul>
        </div>
      </section>
    </>
  );
}

export default DefenderArchetypeMethod;
