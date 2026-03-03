import React from "react";

function HomePage({ onEnterRadar }) {
  return (
    <section className="info-page">
      <div className="info-card">
        <h1>主页</h1>
        <p>这是球员雷达图模板化出图工具，支持 CSV 导入、实时预览与 SVG/PNG 导出。</p>
        <button onClick={onEnterRadar}>进入雷达图生成器</button>
      </div>
    </section>
  );
}

export default HomePage;
