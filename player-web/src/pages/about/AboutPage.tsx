import React from "react";

function AboutPage() {
  return (
    <section className="info-page about-page">
      <div className="info-card about-shell">
        <div className="about-head">
          <p className="about-kicker">About</p>
          <h1>规则先行，输出可复现</h1>
          <p>本项目聚焦模板化出图与 Web 交互分析，核心目标是稳定口径、可追溯与可持续协作。</p>
        </div>

        <div className="about-grid">
          <article className="about-card">
            <h2>项目定位</h2>
            <p>服务于足球数据分析工作流，支持 CSV/Excel 输入、图表生成与导出，不扩展为数据抓取平台。</p>
          </article>
          <article className="about-card">
            <h2>字段与口径</h2>
            <p>标准输入字段为 metric/value/group/order。展示值必须可追溯到原始字段，不做不可追溯改写。</p>
          </article>
          <article className="about-card">
            <h2>协作原则</h2>
            <p>默认值、语义和行为变化都需要文档同步，确保团队在同一事实源上迭代。</p>
          </article>
          <article className="about-card">
            <h2>版本与致谢</h2>
            <p>当前构建：26.3.1</p>
            <p>感谢大飞提供技术支持。</p>
          </article>
        </div>
      </div>
    </section>
  );
}

export default AboutPage;
