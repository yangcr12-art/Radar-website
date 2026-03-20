import React from "react";

function HomePage({ onEnterRadar, onEnterScatter, onEnterMatchRadar }) {
  return (
    <section className="info-page home-page">
      <div className="info-card home-shell">
        <div className="home-hero">
          <p className="home-kicker">Player Chart System</p>
          <h1>足球数据分析可视化工作台</h1>
          <div className="home-cta">
            <div className="home-cta-actions">
              <button onClick={onEnterRadar}>进入雷达图生成器</button>
              <button className="home-cta-secondary" onClick={onEnterScatter}>
                进入数据散点图
              </button>
              <button className="home-cta-secondary" onClick={onEnterMatchRadar}>
                进入比赛雷达图
              </button>
            </div>
          </div>
        </div>

        <div className="home-proof">
          <article className="home-proof-card">
            <h2>输入口径统一</h2>
            <p>围绕字段语义设计流程，避免硬编码造成不可复现结果。</p>
          </article>
          <article className="home-proof-card">
            <h2>统计规则稳定</h2>
            <p>筛选、展示与统计基准分离，交互变化不影响业务口径。</p>
          </article>
          <article className="home-proof-card">
            <h2>变更可审计</h2>
            <p>默认值与行为变更有文档可查，适配长期协作与复盘。</p>
          </article>
        </div>

        <div className="home-flow">
          <article className="home-flow-step">
            <p className="home-flow-index">01</p>
            <h3>导入数据</h3>
            <p>从 Excel/CSV 读取球员数据，建立可追溯输入基线。</p>
          </article>
          <article className="home-flow-step">
            <p className="home-flow-index">02</p>
            <h3>选择指标</h3>
            <p>在统一映射和分组规则下，选择要展示与对比的核心指标。</p>
          </article>
          <article className="home-flow-step">
            <p className="home-flow-index">03</p>
            <h3>生成并导出</h3>
            <p>一键生成图表并导出结果，确保展示值可回溯到源字段。</p>
          </article>
        </div>
      </div>
    </section>
  );
}

export default HomePage;
