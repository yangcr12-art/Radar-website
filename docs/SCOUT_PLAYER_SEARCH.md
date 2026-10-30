# 球探搜索：姓名筛选

Goal：在球探搜索页通过姓名快速查找当前结果中的球员。

DoD：原名/中文别名/部分姓名可搜索；全部分页参与筛选；保留分数、排名和比较群体；清空恢复；零匹配明确提示。

修改文件：ScoutSearchPage.tsx（搜索框、结果过滤与分页）、scoutPlayerSearch.ts（纯匹配工具）、scoutSession.ts（复用账号/标签页设置保存关键词）、styles/scout-search.css（搜索框样式）、USAGE.md、scripts/check_scout_player_search.mjs、本文件。

规则：先完成现有职责评分、排序、左右侧/兼容性及隐藏过滤，再按姓名筛选；不扩大位置池，不自动恢复隐藏球员。保留后端原名，别名仅辅助查找。无关键词使用原列表；输入关键词从第1页展示，零结果不显示不相干球员详情。未运行模型时提示先运行；其他榜单或出场门槛外的球员不在本次搜索范围。

行为不变性：入口/导航、职责模型、出场门槛、模块权重、分数/排名、百分位比较群体及隐藏状态不变；仅增加结果显示筛选。数据集管理页未改。

验证命令：

```bash
node scripts/check_scout_player_search.mjs
node scripts/check_frontend_session.mjs
node scripts/check_radar_import_and_fitness_session.mjs
python3 scripts/audit_architecture.py
MPLBACKEND=Agg MPLCONFIGDIR=/tmp/player-mpl-cache python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title "Smoke Test" --subtitle "Template Validation"
cd player-web
npm run build
```

未改后端，无需重启后端；不新增外部API，不改已有用户数据，不部署线上。

结果：三份前端回归脚本、架构审计、Agg雷达冒烟及生产构建通过；仍有原有主包超过500kB提示。浏览器使用当前西乙数据的支点中锋模型验证：原榜单108人/6页，从第2页选取Jorge Pascual搜索，匹配1人/1页，原排名21及最终分61.0保持；无匹配明确提示，清空后恢复108人/6页。结束时清空测试关键词。截图：out/scout-player-search.jpg。

I have read: README、USAGE 4.15/9、AGENTS、contributing_ai、现有ScoutSearchPage/scoutSession与姓名对应表工具。
