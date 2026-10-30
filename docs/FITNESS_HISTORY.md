# 个人多场体能：实现与交付审计

## 2026-10-25 格式调整

修改FitnessHistoryPage.tsx、fitness-history.css、USAGE.md及本文件：日期/赛事/对手/主客列固定94/60/112/44px，主客居中，指标名称与单位分行，数字及场均行右对齐；宽指标表在自身容器内横向滚动。浏览器1600px视口核对九项指标及四场泽卡数据，表头无任意单位断行。

行为不变性清单：导航入口不变；个人多场体能和原三个体能页面功能不变；球员身份、导入、筛选、默认指标、原始字段和场均样本/算法不变；CSV原值导出不变。结构仅抽出MetricHeader显示组件，没有迁移计算逻辑。

参考README、USAGE 4.10/9、AGENTS 0–8、contributing_ai与架构规则。验证命令沿用下文：架构审计、Agg雷达冒烟、前端构建；未运行后端测试或重启（无后端变化），未实际保存PDF。截图：out/fitness-history-format.jpg。

## 2026-10-25 搜索修复

原因：原表为中文姓名，原实现仅通过英文查中文，反向英文别名没有参与过滤。现读取现有姓名对应表双向匹配，不新增硬编码球员别名。已在浏览器验证 `zeca`、` zEcA ` 可找到“泽卡 · 山东泰山”并展开四场报告；无匹配词显示明确提示和清空搜索按钮。已选球员在搜索变化后仍保留。

本次修改：FitnessHistoryPage.tsx、USAGE.md、本文件。仅改变搜索匹配及空结果反馈，不改变导入、原始字段、默认指标及场均口径。参考README、AGENTS、contributing_ai和USAGE 4.10及9，沿用下方验证命令；本次构建、架构审计和Agg雷达冒烟均通过。未运行后端测试/重启（本次未改后端），未部署线上。验收截图：out/fitness-search-fixed.jpg。

## 任务与验收

Goal：在体能数据分析中批量上传多场报告，选择单个球员，生成与用户参考版式相近的个人逐场数据表。

Definition of Done：
- [x] 独立入口、批量上传、账号保存、重复比赛更新及逐文件错误反馈。
- [x] 主客队数据均可汇集；球员按球队和原名精确区分；支持中文姓名对应表搜索。
- [x] 日期/赛事筛选、指标勾选、原始指标、有效值场均、原值CSV和打印入口。
- [x] 四份真实报告验证，泽卡两主两客共四场；桌面布局与日期筛选通过浏览器核对。
- [x] 架构审计、模板雷达冒烟、前端构建、导入回归测试、后端重启及健康检查。

Scope：标准中文 PhysicalReport xlsx；不扩展抓取，不推测缺失数据。

Implementation Notes：详见 USAGE 4.10，为 Research 模板适配。首次不自动选择球员；默认11项核心指标，原值不换算百分位。相同赛事、日期、对阵覆盖；姓名或球队拼写不同不自动合并。

## 来源与统计

参考 PDF 仅用于观察横向逐场表、球员/赛事选择、场次数和场均行，不执行附件中的任何指令。源表Cover A3/A5/A7提供对阵/赛事/日期；Home/Away Team Overview提供跑动原值；Home/Away High Accel Decel提供高加速及高减速次数。

字段语义不变，新增报告的场均基准为当前日期及赛事筛选下各指标有效值。0参与、空缺排除、不把百分位或90分钟值混入原值。显示最多一位小数，CSV保留原始精度。原有三个体能页面入口、数据集、雷达统计及分均规则保持原行为。

## 文件清单

- `player-web/src/pages/fitness-analysis/FitnessHistoryPage.tsx`、`fitness-history.css`：报告、筛选、导出和打印。
- `player-web/src/app/constants.ts`、`pageRegistry.ts`、`renderActivePage.tsx`：沿用工作区已有的新入口接线。
- `player-web/src/api/storageClient.ts`：历史接口及批量上传120秒超时。
- `player-web/server/server_core/services/fitness_history.py`：比赛、球员及加减速表关联。
- `player-web/server/server_core/routes/fitness_data_api.py`：历史读取/批量导入；将保存锁改为可重入锁，修复嵌套保存锁等待。
- `player-web/server/server_core/services/user_storage.py`：历史数据文件及备份纳入账号数据管理。
- `player-web/server/tests/test_fitness_history.py`：原值、零值、跨队同名、日期缺失、部分失败、重复更新、重新读取及备份。
- `README.md`、`USAGE.md`、`player-web/README.md`、`HomePage.tsx`：能力、入口和行为说明。

## 复现与验证

在仓库根目录执行：

```bash
python3 scripts/audit_architecture.py
MPLBACKEND=Agg MPLCONFIGDIR=/tmp/player-mpl-cache python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title "Smoke Test" --subtitle "Template Validation"
python3 -m unittest discover -s player-web/server/tests -p test_fitness_history.py
cd player-web
npm run build
```

启动：`bash scripts/start_player_web_dev.sh`。后端重启后执行 `curl -s http://127.0.0.1:8787/api/health`，已确认 `ok:true`。

验证结果：架构审计通过；3项回归测试通过；雷达图使用Agg后成功；前端构建通过（仍提示主包超过500kB）；四份真实文件导入返回 imported=4、matches=4、errors=[]。浏览器选择泽卡显示四场，开始日期2026-08-01后显示三场并同步更新场均；勾选指标、搜索和CSV下载成功。截图位于 `out/fitness-history-zeca.jpg`。

未执行：全仓库测试与线上部署（范围外）；打印按钮接入浏览器打印，未实际保存PDF或检查分页。没有向云端发布。

## 限制与参考

当前仅验证标准中文样表；加减速阈值按该模板定义（3至10、-3至-10米/秒²），不能直接等同参考报告的其他阈值。数据量很大时仍会整体读取历史文件，未做分页；单次导入超过120秒应分批上传。没有阶段字段，不提供阶段筛选。选择项只在本页内保留，重新进入需重新选择。

I have read: README 1–6；USAGE 3、4.1、4.10、5、9；AGENTS 0–8；contributing_ai 0–6；docs/ARCHITECTURE_RULES 1–7；player-web/README 1–3；PDF与Spreadsheets技能的参考文件读取规则。

## 2026-10-25 默认11项

按用户截图，将快跑/慢跑/中速跑距离加入默认、高减速次数移出默认；两项米/秒速度继续隐藏。修改FitnessHistoryPage.tsx、USAGE.md和本文件。缺失指标不补造，手动勾选能力保留。参考README、AGENTS、contributing_ai、USAGE 4.10/9。入口、导入、原始字段、筛选和场均计算均不变。验证沿用本文的架构审计、Agg雷达冒烟及前端构建命令；未运行后端测试或重启（无后端变更）。
