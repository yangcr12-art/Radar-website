# 任务：排名未通过准入时仅显示未达标

Goal：当前职责相似度未通过时仅显示“未达标”，不再显示原因。
Definition of Done (DoD)：当前职责eligible=false仅显示未达标，无原因正文或悬停；通过仍显示数值；缺少判断仍横线；不改计算。
Scope：仅排名单元格、局部浅色样式及说明；不改后端、算法、存储或详情诊断，不推送或部署。
Implementation Notes：按result.model.id读取该球员archetype.fits，不能读取主职责或未提交的新选择；不读取原因作为排名文案。旧positionIdentityModel展示保留原路径。
Files：player-web/src/pages/scout-search/ScoutSearchPage.tsx、player-web/src/styles/scout-search.css、USAGE.md、本文件。
Commands / Tests：见下方验证记录。
Risks：简短状态不解释具体条件，原详情诊断仍可查看；不扩展判断逻辑。

行为不变性：导航入口、核心排名/详情、点击球员、左右筛选、20人分页与隐藏不变；评分、百分位比较池、准入、主标签及排序不变；字段语义与默认权重不变。仅当前职责未通过状态的展示变化；无文件移动或业务重构。

参考：AGENTS.md第0/1/6/7/8节、README.md第3/5/6节、USAGE.md第4.15/9节、contributing_ai.md任务模板与交付协议。

## 简短状态验证记录

本轮修改上方Files列出的四个文件。下方同一组可复现命令全部通过：架构审计、模板出图、Web构建、git diff --check。实际组件服务端渲染3项断言通过：失败仅输出未达标、通过零分保留0.0、不包含原因或悬停title。无评分及字段语义变化；导航、排名/详情交互、筛选分页和统计基准不变；无结构重排。

未运行浏览器人工视觉检查或后端测试/重启（只改前端文案与样式），未推送或部署。保留既有构建500kB提示及Matplotlib临时缓存提示，不影响验证。

## 初版原因展示验证记录（历史）

以下命令已运行通过：

```bash
cd /Users/yangchangran/xiangmu
python3 scripts/audit_architecture.py
MPLBACKEND=Agg python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title 'Smoke Test' --subtitle 'Template Validation'
git diff --check
cd /Users/yangchangran/xiangmu/player-web
npm run build
```

另在player-web目录通过Node、esbuild和React服务端渲染实际RankingSimilarityCell，7项断言通过：未通过状态、具体原因、空原因回退、通过且零分保留0.0、非当前职责失败不误判、无判断记录不误判、旧身份模型仍显示最高合格分。未新增依赖。构建保留既有500kB体积提示；Matplotlib临时缓存提示后出图成功。

本轮未改后端，未重启或重复运行后端测试；未进行浏览器人工视觉核对，仅做组件实际渲染与构建验证。未部署或推送Git，保留此前工作区修改。
