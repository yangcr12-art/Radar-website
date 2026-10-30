# 工作台选择恢复与雷达导入保护

## 任务

Goal：修复个人多场体能切页丢选择，以及导入新数据覆盖已保存雷达版本。

DoD：选择可跨切页/刷新恢复且按账号隔离；球员数据与CSV两条导入路径都进入草稿，旧版本内容及时间不变；失败CSV不影响当前版本；保留手工编辑版本原行为。

Scope：个人多场体能及雷达导入；数据集管理本轮仅提出方案。用户要求不改菜单点击跳页、导航组织、体能页面合并、保存体积和算法说明。

## 实现与口径

- `src/pages/fitness-analysis/fitnessHistorySession.ts`：使用既有账号隔离sessionStore保存UI选择，不存比赛数据；校验日期、字段数组，存储失败容错。
- `src/pages/fitness-analysis/FitnessHistoryPage.tsx`：恢复所选球员、搜索、赛事、日期及指标；数据成功读取后清理失效选择，网络失败不抹去选择；切换球员不重置指标，新增“恢复默认11项”。
- `src/hooks/useRadarEditorController.ts`：新增importSnapshotAsDraft，先退出原版本再应用导入数据；成功CSV同样切入草稿并清空待保存名称。
- `src/App.tsx`：球员导入调用新草稿入口。
- `src/components/RadarEditorPage.tsx`：保存区说明导入新数据的草稿行为。
- `USAGE.md`：4.2/4.10/9同步行为与默认值。
- `scripts/check_radar_import_and_fitness_session.mjs`：执行真实雷达controller和session模块，测试版本内容/更新时间保护、CSV失败、手工编辑兼容、账号隔离、空勾选、日期和损坏存储。

行为不变性：导航入口和点击行为不变；原三个体能页面不变；指标值、百分位、场均和筛选基准不变；11项首次默认不变；已有雷达版本手工编辑仍自动保存；数据集文件、图片存放与后端接口不变。结构仅增加会话工具和导入入口，无保存体积优化。

## 验证命令

```bash
node scripts/check_radar_import_and_fitness_session.mjs
node scripts/check_frontend_session.mjs
python3 scripts/audit_architecture.py
MPLBACKEND=Agg MPLCONFIGDIR=/tmp/player-mpl-cache python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title "Smoke Test" --subtitle "Template Validation"
cd player-web
npm run build
```

未运行后端重启/测试：没有后端改动；未测试线上账号，不改用户保存版本做破坏性验收。修复针对后续导入，不自动恢复过去已覆盖的版本。

执行结果：两份前端回归脚本、架构审计、Agg雷达冒烟及生产构建全部通过。构建仍提示主包超过500kB，本轮按用户要求不做打包或保存体积优化。

浏览器验收：选择泽卡、输入zeca、开始日期2026-07-01，取消慢跑距离后显示10项/7场；离开到主页再进入、以及刷新页面，均恢复相同球员/搜索/日期/10项指标。随后验证恢复默认11项成功并清除测试日期，显示8场。截图：out/workbench-selection-restore.jpg。未在用户真实版本上执行导入覆盖测试；该回归使用真实控制器和隔离内存状态完成。

I have read: README 1/2/5、USAGE 4.2/4.10/9、AGENTS 0–8、contributing_ai 0–6；相关sessionStore、storageScope、scoutSession和雷达控制器。

## 数据集管理建议（尚未实现）

不重排导航；从主页或数据集选择器旁进入“管理已导入数据”。按球员、比赛、单场体能、个人多场体能、Opta、积分走势、StatsBomb CSV分类；列出名称、来源文件、导入时间、球员/比赛数量、磁盘占用及可用操作。不同类型保留各自数据空间和统计口径，只统一管理入口。

第一版推荐：查询/分类/排序、改显示名、打开对应分析页、疑似重复提示、移入回收站与恢复。回收站显式保留，不自动清空；大小区分活动数据和回收站，避免误以为移入回收站已释放磁盘。批量删除不默认勾选，重复提示不自动合并或删除。

已有多数类型提供列表/删除API；显示名、容量统计、回收站需要新的后端管理能力，不能直接用当前永久删除接口冒充可恢复删除。个人多场体能应按比赛列出记录；同一场数据由多球员共用，删除应明确影响该场全部球员。雷达已保存版本独立管理，不把删数据集与删成图绑定。当前账号隔离须全程保持。
