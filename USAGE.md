# USAGE

`player` 项目的命令与功能行为事实源。  
如与其他文档冲突，以 `AGENTS.md` 和本文件为准。

---

## 1. CLI：单图生成

```bash
python3 scripts/generate_player_radar.py \
  --input <input_csv> \
  --output <output_png> \
  --title "<主标题>" \
  --subtitle "<副标题>" \
  --dpi 220
```

示例：

```bash
python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/alberto_quiles.png \
  --title "Alberto Quiles Piosa (30, CF, 2901 mins.), Tianjin Tigers" \
  --subtitle "2025 Chinese Super League Percentile Rankings & Per 90 Values"
```

参数：

- `--input`：输入 CSV（必填）
- `--output`：输出 PNG（必填）
- `--title`：主标题（必填）
- `--subtitle`：副标题（可选）
- `--dpi`：图片清晰度，默认 `220`

---

## 2. CSV 字段规则

必填字段：

- `metric`
- `value`（0-100）
- `group`
- `order`（整数）

可选字段：

- `subOrder`
- `per90`
- `tier`（`elite/above_avg/avg/bottom`）
- `color`

---

## 3. Web：启动方式

先进入仓库根目录（本机示例）：

```bash
cd /Users/yangchangran/xiangmu
```

推荐（默认）：一键启动（自动检查后端健康，不健康则自动拉起后端，再启动前端）

```bash
bash scripts/start_player_web_dev.sh
```

启动后可验证后端健康：

```bash
curl -s http://127.0.0.1:8787/api/health
```

备选：双终端手动启动（调试时使用）

```bash
# 1) 后端（终端 A）
cd player-web/server
python3 -m pip install -r requirements.txt
python3 app.py
```

后端启动后，建议至少验证一次健康检查：

```bash
curl -s http://127.0.0.1:8787/api/health
```

```bash
# 2) 前端（终端 B）
cd /Users/yangchangran/xiangmu/player-web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

可选环境变量：

- `VITE_STORAGE_API_BASE`：后端地址，默认 `http://127.0.0.1:8787`

Web 技术事实：

- 前端源码位于 `player-web/src`
- 源码统一为 TypeScript（`.ts/.tsx`）
- 不变更现有后端接口路径与 JSON 字段口径

---

## 4. Web 功能行为（按页面）

## 4.1 导航

顶部导航采用“一级菜单 + 下拉菜单”：

- 主页（一级菜单）
- 数据雷达图（下拉：球员数据、雷达图生成器）
- 散点图生成器（一级菜单）
- 对应表（下拉：项目对应表、比赛项目对应表、姓名对应表、球队对应表）
- 比赛总结（下拉：球队数据、比赛雷达图）
- About（一级菜单）

下拉菜单支持两种触发方式：鼠标悬停展开、点击展开/收起。

左上角品牌文案：`生成器V3.3`

## 4.2 球员数据

- 支持导入 Excel（`.xlsx`）
- 必须包含 `player` 列，按宽表读取（一行一个球员）
- 导入前会检查后端健康状态；当 `http://127.0.0.1:8787/api/health` 不可用时，导入按钮禁用并提示
- 数值列自动参与排名与百分比
- 支持按数据集切换、删除、搜索球员、选择球员
- 支持按数据集勾选指标，一键导入雷达图生成器

一键导入口径：

- `value = 百分比`
- `per90 = 该球员原始列值`
- `metric` 优先使用项目对应表中文名
- `group` 优先使用项目对应表配置
- 导入到雷达图后，标题模板中的球员英文名、中文名、年龄、位置会同步更新（中文来自姓名对应表）
- 导入到雷达图后，会自动清除雷达图左上角图片（避免沿用上一个球员照片）

雷达图生成器补充：

- 左侧底部“数据表”支持展开/收起开关（默认展开）
- 图表样式支持设置右图背景颜色（默认 `#f8f5ef`）
- 图表样式区桌面端采用三列排布
- 图片设置区已对齐为统一选项块间距与紧凑行距

## 4.3 散点图生成器

基础能力：

- 选择 X/Y 轴
- 可在“数据集控制”里删除当前数据集
- 按范围筛选点
- 悬浮提示、点选联动详情
- 显示球员名字开关
- 球员名字字号可调（数字输入 + 滑块）
- 图表背景颜色可调
- 点大小、边框颜色、边框粗细可调
- 平均线开关、平均线颜色、平均线粗细可调

关键口径：

- 平均值计算基于“全量有效点（X/Y 可解析）”
- 改 `X/Y 最小值最大值` 只影响可见点与坐标缩放，不改变平均值统计口径

球队样式联动：

- 按“球队对应表” `English` 字段匹配球队（大小写不敏感）
- 匹配成功：使用对应 `color` 与 `shape`
- 未匹配：颜色回退为黑色
- 数据集无球队列（Team/Club/Squad）：保持默认样式并提示
- 球员名字显示优先使用“姓名对应表”中文名，未命中回退英文名

雷达标题联动：

- 标题中的球员名使用 `English 中文`（中英文之间空格分隔，中文来自姓名对应表）
- 未命中中文时仅显示英文名
- 标题模板支持手动填写“中文名”输入框；填写后优先使用手填中文

## 4.4 项目对应表

- 维护 Excel 列的中英映射
- 支持维护 `group`
- 支持“从 Excel 增量导入项目”（读取活动 Sheet 首行表头，仅新增不存在项目）
- 支持手动新增项目
- 支持删除项目：内置已有项目执行“仅页面隐藏”，不改变全局映射；新增项目执行实际删除
- 支持下载对应表 CSV

## 4.5 比赛项目对应表

- 仅用于比赛总结（球队数据/比赛雷达图）的中英文映射与分组维护
- 支持导入 Excel（`.xlsx`），读取第1行英文锚点和第2行中文锚点并拆分复合标题
- 已内置拆分特例：`射门 / 射正`（三列 -> 射门数/射正数/射正率）、`夺回球权/低位/中位/高位`（四列 -> 总/低/中/高）
- 支持手动新增、删除、下载对应表 CSV
- 与“项目对应表”（球员数据域）完全隔离

## 4.6 姓名对应表

- 维护球员英文名/中文名/球队
- 支持导入 Excel（`.xlsx`）并读取姓名列（优先 `Player` / `Name`）
- 导入时可读取球队列（如 `Team/Club/Squad`），按球队对应表映射为中文球队
- 球队未在球队对应表命中时留空，便于手动补录
- 支持“从球员数据同步姓名”（增量合并）
- 中文翻译默认“保留已有中文，仅补空值”，并支持离线音译自动补全
- 支持“批量补全中文名”（仅填空，不覆盖）
- 支持按“球队”列排序（仅调整行顺序，不修改单元格内容）
- 支持一键删除现有姓名（清空姓名对应表）
- 支持下载姓名对应表 CSV
- 刷新后保留（本地持久化）

## 4.7 球队对应表

- 维护球队英文名/中文名
- 维护 `color` 与 `shape`
- 支持单队上传 logo，并本地持久化
- 支持批量导入 logo（按文件名匹配球队中/英文）
- 支持颜色与形状示意
- 支持“从球员数据同步球队”（增量合并，不覆盖已填中文）
- 刷新后保留（本地持久化）

## 4.8 比赛总结 / 球队数据

- 独立于球员数据域，使用独立后端接口 `/api/match-data/*`
- 支持导入 Excel（`.xlsx`），必须包含 `Team` 列
- 支持数据集切换、删除、搜索球队、选择球队
- 支持勾选指标并一键导入“比赛雷达图”
- 导入只作用于“比赛雷达图”，不影响球员数据、散点图、雷达图生成器
- 列标题显示与分组优先使用“比赛项目对应表”

## 4.9 比赛总结 / 比赛雷达图

- 使用同一比赛数据集内“主队/客队”双队对比
- 支持编辑主标题/副标题、主客队比分、主客队颜色
- 支持主客队 logo 下拉选择（来源：球队对应表，支持自动匹配）
- 支持导出 SVG/PNG
- 与原“雷达图生成器”状态和草稿完全隔离

---

## 5. 默认值与回退表

- 散点图“样式”面板默认：收起
- 散点图“显示控制”面板默认：收起
- 散点图平均线默认：显示
- 散点图球员名字字号默认：`11`（范围 `8-20`）
- 散点图背景颜色默认：`#f8f5ef`
- 球队映射未命中：黑色
- 球队形状未配置或非法：回退圆形
- 数据集无球队列：不启用球队样式
- localStorage 键名：保持 `player_web_*_v1` 兼容，不做破坏式改名

---

## 6. 常见问题

1. `Missing dependency`

```bash
pip install matplotlib numpy
```

2. `Missing required columns`
- 检查 CSV 是否包含 `metric/value/group/order`

3. `value must be 0..100`
- 百分位必须在 0 到 100 之间

4. 散点图“无有效散点”
- 检查 X/Y 是否已选择
- 检查筛选范围是否过窄
- 检查 X/Y 列是否为数值

---

## 7. 架构审核（阻断）

```bash
python3 scripts/audit_architecture.py
```

输出：

---

## 8. PDF 中文覆盖西语（离线）

用于在不改变底图结构（图片/表格线）的前提下，把 PDF 中文文本块覆盖为西语文本。

```bash
python3 scripts/pdf_overlay_es.py \
  <input.pdf> \
  <output.pdf> \
  --mapping templates/pdf_overlay_es_mapping.json
```

参数：

- `input.pdf`：输入 PDF（必填）
- `output.pdf`：输出 PDF（必填）
- `--mapping`：翻译映射 JSON，默认 `templates/pdf_overlay_es_mapping.json`

映射文件结构：

- `exact`：整段精确替换（`cn` -> `es`）
- `phrase`：短词/表头子串替换

- `out/architecture_audit_report.json`
- `out/architecture_audit_report.md`

任一规则违规，命令返回非零退出码。

导入链路冒烟测试（需后端已启动）：

```bash
bash scripts/smoke_test_dataset_import.sh
```

---

## 8. GitHub 更新与 Tag

详见：`docs/GITHUB_WORKFLOW_AND_TAGS.md`

常用命令：

```bash
git checkout main
git pull origin main
git checkout -b feature/<topic>
git add .
git commit -m "feat: <message>"
git push -u origin feature/<topic>
```

---

## 9. 行为更新记录

- `2026-03-03 / V3.3`
  - 导航品牌更新为 `生成器V3.3`
- `2026-03-03 / V3.3.1`
  - 球员数据页导入新增后端健康门禁：后端离线时禁用“导入 Excel”并提示
  - 新增一键启动命令：`bash scripts/start_player_web_dev.sh`
  - 新增导入冒烟命令：`bash scripts/smoke_test_dataset_import.sh`
  - 新增“姓名对应表”页面，位于“项目对应表”之后
  - 姓名对应表新增 Excel 导入能力（姓名列识别 + 保留已有中文）
  - 姓名对应表导入支持中文球队映射与离线中文名补全
  - 散点图球员名字与雷达标题可联动姓名对应表中文名
  - 散点图球队映射颜色/形状口径明确
  - 散点图平均线统计与筛选口径分离并文档化
  - 文档体系升级为规则化操作手册
- `2026-03-03 / V3.3-TS`
  - 前端 `player-web/src` 全量迁移为 TypeScript（`.ts/.tsx`）
  - 保持 `React + Vite` 框架不变，未新增路由/状态管理依赖
  - `index.html` 入口更新为 `/src/main.tsx`
  - 保持 localStorage 键名与后端接口兼容，现有内容可直接读取

---

_最后更新：2026-03-03_
