import React from "react";

function HomePage({ onEnterRadar }) {
  return (
    <section className="info-page home-page">
      <div className="info-card home-shell">
        <div className="home-hero">
          <p className="home-kicker">Player Chart System</p>
          <h1>模板化出图，稳定且可追溯</h1>
          <p>
            以 CSV/Excel 字段为单一事实源，快速完成球员雷达图与散点分析，保证输出可复现、规则可审计。
          </p>
          <div className="home-cta">
            <button onClick={onEnterRadar}>进入雷达图生成器</button>
            <span>建议流程：球员数据 → 图表生成 → 导出</span>
          </div>
        </div>

        <div className="home-kpis">
          <article className="home-kpi-card">
            <h2>输入口径统一</h2>
            <p>围绕字段语义设计流程，避免硬编码造成不可复现结果。</p>
          </article>
          <article className="home-kpi-card">
            <h2>统计规则稳定</h2>
            <p>筛选、展示与统计基准分离，交互变化不影响业务口径。</p>
          </article>
          <article className="home-kpi-card">
            <h2>交付可审计</h2>
            <p>默认值与行为变更有文档可查，适配长期协作与复盘。</p>
          </article>
        </div>
      </div>
    </section>
  );
}

export default HomePage;
