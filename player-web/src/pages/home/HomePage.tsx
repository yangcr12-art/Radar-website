import React, { useMemo } from "react";
import { NAV_ITEMS, type NavItem } from "../../app/constants";

function HomePage({ onNavigate }: { onNavigate: (pageKey: string) => void }) {
  const featureCards = useMemo(
    () =>
      NAV_ITEMS.flatMap((item: NavItem) => {
        if (item.key === "home") return [];
        const childItems = Array.isArray(item.children) ? item.children : [];
        const targetKey = childItems.length > 0 ? String(childItems[0]?.key || "") : item.key;
        const clickable = item.key !== "mapping_menu" && Boolean(targetKey);
        return [
          {
            key: item.key,
            title: item.label,
            targetKey,
            clickable
          }
        ];
      }),
    []
  );

  return (
    <section className="info-page home-page">
      <div className="info-card home-shell">
        <header className="home-editorial-hero">
          <div className="home-hero-copy">
            <p className="home-kicker">Player Chart System</p>
            <h1>足球数据分析可视化工作台</h1>
            <p className="home-hero-subtitle">规则稳定、视觉清晰、协作可追溯。</p>
          </div>
          <aside className="home-hero-art" aria-hidden="true">
            <p className="home-hero-art-mark">VOL.26</p>
            <p className="home-hero-art-title">made by YCR</p>
            <p className="home-hero-art-note">Data, Design, Discipline</p>
          </aside>
        </header>

        <section className="home-feature-hub-wrap">
          <div className="home-feature-head">
            <p className="home-kicker">Features</p>
            <h2>全部功能入口</h2>
          </div>
          <div className="home-feature-hub">
            {featureCards.map((card) => (
              <article key={card.key} className={`home-feature-card${card.clickable ? "" : " is-disabled"}`}>
                <h3>{card.title}</h3>
                {card.clickable ? (
                  <button type="button" onClick={() => onNavigate(card.targetKey)}>
                    进入
                  </button>
                ) : (
                  <span className="home-feature-disabled-tag">仅展示</span>
                )}
              </article>
            ))}
          </div>
        </section>
        <div className="home-bottom-pad" aria-hidden="true" />
      </div>
    </section>
  );
}

export default HomePage;
