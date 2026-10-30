import React from "react";
import { NAV_ITEMS } from "../../app/constants";

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  data_radar_menu: "导入球员 Excel，选择百分位指标，编辑模板并导出 SVG / PNG。",
  scatter_analysis_menu: "用散点图筛选球员，用个人叠加雷达比较指标；球员颜色可独立设置。",
  match_summary_menu: "查看球队比赛数据，选取两支球队生成比赛对比雷达。",
  fitness_analysis_menu: "导入体能 Excel，比较两队、球员叠加及分均数据，批量汇集个人逐场体能。",
  opta_analysis: "导入 Opta PDF，查看主客队进攻、防守数据排序。",
  scout_search_menu: "按位置与职责筛选球员，查看能力排名、职责相似度及逐指标解释。",
  csl_standings_trend: "导入赛程 Excel，查看积分、排名、进球和丢球走势及扣分影响。",
  statsbomb_data: "导入 Classic Scout CSV，或连接已授权商业 API 查看比赛与赛季统计。",
  mapping_menu: "维护项目、比赛项目、姓名和球队对应表，统一指标翻译与球队样式。"
};

function HomePage({ onNavigate }: { onNavigate: (pageKey: string) => void }) {
  const featureCards = NAV_ITEMS.filter((item) => item.key !== "home" && item.key !== "about");
  return (
    <section className="info-page home-page">
      <div className="info-card home-shell">
        <header className="home-editorial-hero">
          <div className="home-hero-copy">
            <p className="home-kicker">Football Analysis · V3.3</p>
            <h1>足球数据分析工作台</h1>
            <p className="home-hero-subtitle">从球员筛选、球队比较到图表导出，在同一工作台完成日常分析。</p>
            <div className="home-quick-actions">
              <button type="button" onClick={() => onNavigate("player_data")}>导入球员数据</button>
              <button type="button" onClick={() => onNavigate("scout_search")}>进入球探搜索</button>
            </div>
          </div>
          <aside className="home-hero-art">
            <p className="home-hero-art-mark">Football Intelligence</p>
            <p className="home-hero-art-title">洞察比赛<br />理解球员</p>
            <p className="home-hero-art-note">DATA · INSIGHT · FOOTBALL <span>MADE BY YCR</span></p>
          </aside>
        </header>

        <section className="home-feature-hub-wrap" aria-labelledby="home-features-title">
          <div className="home-feature-head">
            <p className="home-kicker">工作台功能</p>
            <h2 id="home-features-title">选择分析入口</h2>
          </div>
          <div className="home-feature-hub">
            {featureCards.map((item) => {
              const children = "children" in item ? item.children : [];
              const entries = children.length > 0 ? children : [{ key: item.key, label: "进入分析" }];
              return (
                <article key={item.key} className="home-feature-card">
                  <h3>{item.label}</h3>
                  <p className="home-feature-description">{FEATURE_DESCRIPTIONS[item.key]}</p>
                  <div className="home-feature-links">
                    {entries.map((entry) => (
                      <button key={entry.key} type="button" onClick={() => onNavigate(entry.key)}
                        aria-label={`${item.label}：${entry.label}`}>{entry.label}</button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
          <p className="home-workspace-note">球探职责模型属于 Research，判断需结合样本覆盖、出场分钟和比赛录像。<button type="button" onClick={() => onNavigate("about")}>了解工作台</button></p>
        </section>
      </div>
    </section>
  );
}

export default HomePage;
