import React from "react";

function AboutPage() {
  return (
    <section className="info-page about-page">
      <div className="info-card about-shell">
        <header className="about-editorial-head">
          <p className="about-kicker">About</p>
          <div className="about-hero-grid">
            <div className="about-hero-copy">
              <h1>足球数据的All-In-One 工作台</h1>
              <p>它把模板化出图、Web 分析、字段口径和长期维护放进同一条产品链路里，让数据表达不仅看起来清楚，也能被团队持续复现。</p>
              <div className="about-hero-tags">
                <span>Football Analysis</span>
                <span>Template First</span>
                <span>Docs Driven</span>
              </div>
            </div>

            <aside className="about-hero-panel">
              <p className="about-panel-label">Project File</p>
              <div className="about-panel-metric">
                <strong>V3.3</strong>
                <span>当前工作版本</span>
              </div>
              <div className="about-panel-meta">
                <p>技术支持：大飞</p>
                <p>维护方式：规则先行，行为可追溯。</p>
              </div>
            </aside>
          </div>
        </header>

        <section className="about-evolution-grid">
          <article className="about-card about-roadmap-card">
            <p className="about-section-label">Evolution</p>
            <h2>版本演进</h2>
            <ul className="about-timeline">
              <li>
                <span>2026-03-01</span>
                <p>项目初始导入，雷达图网站工作台进入仓库。</p>
              </li>
              <li>
                <span>2026-03-20</span>
                <p>体能分析工作流落地，并拆分出独立的体能页面结构。</p>
              </li>
              <li>
                <span>2026-03-24</span>
                <p>加入 Opta PDF 分析和体能导入来源控制，分析链路进一步扩展。</p>
              </li>
              <li>
                <span>2026-04-11</span>
                <p>中超积分走势能力加入，支持扣分口径与趋势高亮交互。</p>
              </li>
              <li>
                <span>2026-04-21</span>
                <p>球员指标预设与版本化 PNG 导出增强，日常工作流继续收敛。</p>
              </li>
            </ul>
          </article>
        </section>
      </div>
    </section>
  );
}

export default AboutPage;
