# 任务：按用户截图恢复旧界面，保留当前功能

Goal：恢复暖白米色外观、紧凑表格及雷达右侧固定居中预览。

DoD：停用workbench视觉覆盖；雷达恢复原46%/54%布局；不回退业务代码或数据；构建、审计、模板冒烟通过。

Scope：main.tsx样式导入、RadarEditorPage外部容器/标题与文档。无后端、业务逻辑或数据修改。

Implementation：查阅“设计单球员单场体能展示”对话中2026-10-30 16:36界面统一任务的原始修改记录，逐项反向还原球员数据、主页、个人多场体能和StatsBomb页；About直接使用该次修改前完整读取的原始源码。删除该任务引入的WorkbenchHeader和workbench.css。雷达恢复原.page、左侧编辑/表格、右侧固定居中预览。当前导入进入草稿的说明和保护保留。Open Design在本对话引入的样式、绑定和布局已全部撤回。无字段语义或业务默认值变化。

Files：player-web/src/main.tsx、components/RadarEditorPage.tsx、pages/player-data/PlayerDataPage.tsx、pages/home/HomePage.tsx、pages/about/AboutPage.tsx、pages/fitness-analysis/FitnessHistoryPage.tsx、pages/statsbomb-data/StatsBombDataPage.tsx；移除components/WorkbenchHeader.tsx和styles/workbench.css；README.md、USAGE.md、player-web/README.md及回退审计文档。

行为不变性：所有导航入口、所有业务页面和子页、导入/导出、草稿与版本、存储键、当前数据、value百分位/per90标注、散点全量有效点平均线、图表SVG内容与打印规则均不变。只重排雷达外部视图为原布局。不是git reset，不撤回此前功能修改。

Commands：python3 scripts/audit_architecture.py；MPLBACKEND=Agg MPLCONFIGDIR=/private/tmp/player-mpl-cache python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title "Smoke Test" --subtitle "Template Validation"；npm run build --prefix player-web。

Risks：业务数据决定图表内容，不把截图中的马丁斯数据替换进当前图表。保留原宽屏优先响应式行为及原图表文字配置。无后端变更，无需重启后端；不部署线上。

本记录替代WORKBENCH_VISUAL_UNIFICATION.md中的当前视觉说明，原文保留为历史审计。

I have read: README 1–6、USAGE 4.1/4.2/5/9、AGENTS 0–8、contributing_ai 0–6，现有base/editor/workbench样式及用户截图。
