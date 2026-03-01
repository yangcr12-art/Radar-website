import React from "react";

function AboutPage() {
  return (
    <section className="info-page">
      <div className="info-card">
        <h1>About</h1>
        <p>本项目聚焦模板稳定性与可复现输出，标准输入字段为 metric/value/group/order。</p>
        <p>图表中的所有展示值都可追溯到 CSV 输入，不做不可追溯的数值改写。</p>
        <p>26.3.1构建</p>
        <p>感谢大飞提供技术支持</p>
      </div>
    </section>
  );
}

export default AboutPage;
