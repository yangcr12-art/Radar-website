import React from "react";

function AboutPage() {
  return (
    <section className="info-page about-page">
      <div className="info-card about-shell">
        <header className="about-editorial-head">
          <p className="about-kicker">关于工作台</p>
          <div className="about-hero-grid">
            <div className="about-hero-copy">
              <h1>让足球数据成为分析依据</h1>
              <p>把球员筛选、比赛比较、体能分析和图表制作连接起来。保留原始数据，让每个展示值、评分和图表都能追溯到来源。</p>
              <div className="about-hero-tags"><span>球员与球探</span><span>比赛与体能</span><span>可复现出图</span></div>
            </div>
            <aside className="about-hero-panel">
              <p className="about-panel-label">工作台信息</p>
              <div className="about-panel-metric"><strong>V3.3</strong><span>内容更新：2026-10-10</span></div>
              <div className="about-panel-meta"><p>制作：YCR · 技术指导：大飞</p><p>按账号保存数据与对应表，各账号独立使用。</p></div>
            </aside>
          </div>
        </header>
        <section className="about-capabilities-grid" aria-label="分析能力与使用原则">
          <article className="about-card">
            <h2>球员分析与职责模型</h2>
            <p>标准与算法百分位、散点筛选、个人叠加雷达；职责算法库覆盖中锋、边锋、前腰、中前卫、后腰、边后卫、中卫和门将八个位置族。</p>
            <p>能力分、职责相似度和数据可信度分别展示。Research 模型用于辅助筛选，需结合录像与球队战术核实。</p>
          </article>
          <article className="about-card">
            <h2>比赛、体能与赛季走势</h2>
            <p>球队与比赛雷达、两队及球员体能比较、Opta PDF 概况、中超积分与排名走势。各页面保留自己的数据来源和统计基准。</p>
          </article>
          <article className="about-card">
            <h2>StatsBomb 数据</h2>
            <p>支持 Classic Scout CSV 导入及已授权商业 API。商业 API 需要有效权限；其覆盖积分表不等同于含官方处罚修正的积分榜。</p>
          </article>
          <article className="about-card">
            <h2>数据与保存</h2>
            <p>四类对应表统一名称、指标分组、百分位算法及球队样式。图表样式调整不改写输入数据；模板雷达支持 CSV 与 SVG / PNG 导出。</p>
            <p>刷新后恢复当前标签页的位置和球探运行设置；球探结果需重新运行。浏览器关闭后仍需重新登录。</p>
          </article>
        </section>
        <section className="about-evolution-grid">
          <article className="about-card about-roadmap-card">
            <p className="about-section-label">从项目起步到现在</p><h2>重大版本演进</h2>
            <ul className="about-timeline">
              <li><span>2026-03-01</span><h3>项目起步：模板雷达与球员数据</h3><p>建立雷达图工作台，连接球员数据、项目分组和图表编辑，形成数据导入到可视化的基础流程。</p></li>
              <li><span>2026-03-03—03-05</span><h3>散点分析、对应表与 TypeScript</h3><p>完善散点图与球队颜色/形状映射、姓名中文联动、Excel对应表维护和数据集管理；前端统一为TypeScript，建立规则化文档与审计。</p></li>
              <li><span>2026-03-17—03-18</span><h3>比赛数据总结与两队雷达</h3><p>加入比赛项目对应表和球队比赛对比，完善比赛雷达的导入与持久化，并拆分前端样式。</p></li>
              <li><span>2026-03-20—03-21</span><h3>体能分析与个人叠加雷达</h3><p>落地两队体能、球员叠加与分均分析，完善Sheet识别、全量缩放和球员选中详情；个人雷达进入独立分析页面。</p></li>
              <li><span>2026-03-24</span><h3>Opta PDF 分析</h3><p>新增主客队进攻/防守概况分析，并支持选择体能Excel的主队或客队球员来源。</p></li>
              <li><span>2026-04-11</span><h3>中超积分与排名走势</h3><p>加入赛程Excel导入、2026赛季扣分处理、积分与排名趋势，以及球队高亮和逐轮查看。</p></li>
              <li><span>2026-04-14—04-21</span><h3>指标预设与版本化导出</h3><p>球队颜色与导入联动；球员指标预设支持复用，PNG导出按版本编号，减少重复配置。</p></li>
              <li><span>2026-04-22—04-23</span><h3>前后端分层与共享对应表</h3><p>重组页面、hooks、路由和服务结构；统一对应表CSV/Excel导入及后端同步，加入比赛指标预设。</p></li>
              <li><span>2026-04-24—04-29</span><h3>服务器部署、多账号与数据隔离</h3><p>建立Nginx部署、站内会话登录、多账号配置和保留运行数据的更新流程；各账号的数据集、草稿、对应表与预设独立保存。</p></li>
              <li><span>2026-04-30—05-02</span><h3>导入联动与比赛配置隔离</h3><p>比赛数据导入后即时更新雷达；拆分应用壳与编辑器控制，比赛颜色及配置按数据集/对阵保存。</p></li>
              <li><span>2026-05—08</span><h3>保存可靠性与对应表保护</h3><p>处理队徽缓存容量、导入后立即同步、姓名保留及状态保存覆盖对应表等问题，增强日常保存的稳定性。</p></li>
              <li><span>2026-10-02</span><h3>独立映射存储与项目百分位算法</h3><p>对应表从工作台状态中独立保存；项目算法配置统一接入球员百分位和职责评分，加入稀疏事件处理、分钟可靠度与逐指标贡献解释。</p></li>
              <li><span>2026-10-03—10-08</span><h3>球探搜索与全位置职责算法库</h3><p>建立八个位置族的中文职责能力模型、独立职责相似度、行为支柱与可信度说明；持续完善量效耦合、尖点奖励和中卫/门将模型，保留Research使用边界。</p></li>
              <li><span>2026-10-07</span><h3>StatsBomb 数据接入</h3><p>工作台版本纳入Classic Scout CSV与商业API分析，支持授权比赛目录、覆盖积分表、球队/球员赛季统计与比较，数据空间独立保存。</p></li>
              <li><span>2026-10-09</span><h3>个人雷达逐球员配色</h3><p>默认读取球员所属球队对应表颜色，支持独立选色与恢复默认；雷达、图例和单项比较同步显示。</p></li>
              <li><span>2026-10-10</span><h3>页面恢复与工作台布局整理</h3><p>加入页面位置与球探设置恢复、连接失败重试；统一职责数量控件大小，优化导航换行、窄屏布局和主页功能入口。</p></li>
            </ul>
          </article>
        </section>
      </div>
    </section>
  );
}
export default AboutPage;
