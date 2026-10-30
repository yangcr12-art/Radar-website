# 统一工作台视觉与About近期更新

> 历史记录：其中视觉统一已按用户要求撤回，当前外观见 `LEGACY_APPEARANCE_RESTORE.md`。功能性修改和About内容保留。

Goal：主页、数据雷达图（球员数据与生成器）、个人多场体能、StatsBomb导入区使用一套视觉；About补齐近期重大修改。

DoD：页头、色彩、卡片、按钮、输入框一致；桌面与420px窄屏无页面横向溢出；功能、统计、导出保持原行为；About记录仅包含已完成功能。

Scope：上述页面屏幕外观、About内容、相关文档；不重排导航，不改变一级菜单点击，不合并体能页面，不实现数据集管理，不做存储或加载优化。

## 改动文件与职责

- `player-web/src/components/WorkbenchHeader.tsx`：通用页头（说明、标题、操作区）。
- `player-web/src/styles/workbench.css`：统一暖白背景、深绿强调色、16px卡片、9px按钮、38px控件及响应式规则；仅screen媒体生效，不选择SVG元素。
- `player-web/src/main.tsx`：在已有样式后引入统一层。
- `player-web/src/components/RadarEditorPage.tsx`：编辑器页头与双卡片布局，SVG内容保留。
- `player-web/src/pages/player-data/PlayerDataPage.tsx`：统一页头与数据控制卡片。
- `player-web/src/pages/fitness-analysis/FitnessHistoryPage.tsx`：共用页头，保留上传处理、选择恢复、默认11项和表格。
- `player-web/src/pages/statsbomb-data/StatsBombDataPage.tsx`：共用页头，导入/状态/导航卡片统一外观。
- `player-web/src/pages/home/HomePage.tsx`：接入共用视觉，九类入口及子页面按钮保留。
- `player-web/src/pages/about/AboutPage.tsx`：内容日期2026-10-30；补充10月规则分析、年龄展示、个人多场体能、中英文搜索、默认11项、选择恢复、导入草稿保护与界面整理；近期更新和历史演进分区。
- `README.md`、`USAGE.md`、`player-web/README.md`：当前界面/入口事实同步；校正旧主页补充说明与实际子页面直达不一致的问题。

## 行为不变性清单

- 入口：菜单数量、顺序、点击展开并跳至首个子页的行为不变；主页快捷与全部子入口保留。
- 球员数据：数据集切换、搜索、百分位选择、指标预设、导入与规则分析逻辑不变。
- 雷达生成器：保存版本、导入进入草稿、原始value/per90/group/order/tier、标题样式配置及SVG/PNG绘制不变；只改变网页预览容器布局。
- 个人体能：批量上传、日期/赛事、姓名映射、默认11项、会话恢复、有效值场均、CSV和打印不变。
- StatsBomb：CSV导入、独立数据空间、商业API权限、未配置/待接入提示、数据表原值保持；未上传测试文件或调用商业API。
- About：只加入有代码/使用文档依据的已完成变更；统一数据集管理页仍是提案，不宣称上线。
- 打印：统一CSS仅screen生效，保留个人体能横向A4打印规则；没有修改SVG内部样式或图表配色。

## 验证与复现

```bash
node scripts/check_radar_import_and_fitness_session.mjs
node scripts/check_frontend_session.mjs
python3 scripts/audit_architecture.py
MPLBACKEND=Agg MPLCONFIGDIR=/tmp/player-mpl-cache python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title "Smoke Test" --subtitle "Template Validation"
cd player-web
npm run build
```

浏览器检查：本地主页、雷达生成器、个人体能、StatsBomb和About；420px下主页/雷达/StatsBomb/About的document.scrollWidth均与viewport一致。不在用户版本上执行导入或编辑验证。

结果：构建、架构审计、雷达冒烟、既有会话及导入保护回归通过。球员数据桌面宽度1280px下document.scrollWidth=1280，宽表格仍留在容器内；雷达SVG源码与Git HEAD逐字比较一致。构建仍有主包超过500kB提示，本轮不作加载/打包优化。About与其他页面没有后端变更。

未执行：线上部署、商业API验证、真实文件重新上传、实际打印PDF（本次没有改接口、解析和打印）；无后端修改，无需重启后端。已存在的长雷达标题可能仍需用户调整字号，本轮不改写已保存图表配置。

I have read: README 1–6、USAGE 4.1/4.2/4.10/4.14/9、AGENTS 0–8、contributing_ai 0–6，以及现有home-about/editor/statsbomb样式和About、球员规则分析说明。
