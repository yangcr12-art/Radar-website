import React from "react";

function AboutPage() {
  return (
    <section className="info-page about-page">
      <div className="info-card about-shell">
        <header className="about-editorial-head">
          <p className="about-kicker">About</p>
          <h1>规则先行，长期协作</h1>
          <p>聚焦模板化出图与 Web 分析，让数据表达既准确又有节奏。</p>
        </header>

        <div className="about-columns">
          <div className="about-core-cards">
            <article className="about-card">
              <h2>项目定位</h2>
              <p>服务足球数据分析，不扩展为抓取平台。</p>
            </article>
            <article className="about-card">
              <h2>字段口径</h2>
              <p>展示值可追溯到源字段，不做静默改写。</p>
            </article>
            <article className="about-card">
              <h2>协作原则</h2>
              <p>行为变更先落文档，再进入团队流程。</p>
            </article>
          </div>
          <aside className="about-side-panel">
            <article className="about-card about-version-panel">
              <h2>版本信息</h2>
              <p>当前构建：26.3.1</p>
              <p>技术支持：大飞</p>
            </article>
            <article className="about-card about-roadmap-card">
              <h2>版本路线</h2>
              <ul className="about-timeline">
                <li>
                  <span>V3.3</span>
                  <p>模板化出图与 Web 交互整合。</p>
                </li>
                <li>
                  <span>Next</span>
                  <p>比赛链路与映射维护体验优化。</p>
                </li>
                <li>
                  <span>Ongoing</span>
                  <p>默认值与文档一致性治理。</p>
                </li>
              </ul>
            </article>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default AboutPage;
