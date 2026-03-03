# USAGE

`player` 项目的核心命令是通过 CSV 模板自动生成球员雷达/径向图。

## 1. 单图生成

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

## 2. 参数说明

- `--input`：输入 CSV 路径（必填）
- `--output`：输出 PNG 路径（必填）
- `--title`：主标题（必填）
- `--subtitle`：副标题（可选）
- `--dpi`：图片清晰度，默认 `220`

## 3. CSV 字段（模板）

必填字段：
- `metric`：指标名称
- `value`：百分位值（0-100）
- `group`：指标分组
- `order`：分组顺序（整数）

可选字段：
- `subOrder`：组内顺序（整数，决定同组指标先后）
- `per90`：显示在小标签里的每90数值
- `tier`：`elite/above_avg/avg/bottom`
- `color`：覆盖默认颜色（hex）

## 4. 常见问题

1. `Missing dependency`：
```bash
pip install matplotlib numpy
```

2. `Missing required columns`：
- 检查 CSV 是否包含 `metric/value/group/order`

3. `value must be 0..100`：
- 百分位必须在 0 到 100 之间

## 5. 网页版（可交互输入并导图）

```bash
# 1) 启动存储后端（统一保存草稿与版本）
cd player-web/server
python3 -m pip install -r requirements.txt
python3 app.py

# 2) 启动前端
cd player-web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

网页支持：
- 顶部导航七页面：主页 / 雷达图生成器 / 球员数据 / 散点图生成器 / 项目对应表 / 球队对应表 / About（默认进入雷达图生成器）
- 「项目对应表」页面内置 Excel 首行字段的中英对照表，支持手动填写 `group` 并下载对应表 CSV
- 「球队对应表」页面支持维护球队英文名与中文名映射，支持本地保存与下载球队对应表 CSV
- 「球队对应表」支持点击“从球员数据同步球队”，按所有已导入数据集增量合并球队名（不覆盖已填写中文）
- 「球队对应表」支持额外维护 `color` 与 `shape` 列（位于删除列前），刷新后保留
- 「散点图生成器」会按“球队对应表”的 `English` 匹配当前球员球队并应用点颜色/形状；未匹配球队显示为黑色点（无球队列时保持默认样式）
- 「球员数据」为独立页面，支持导入 Excel（`.xlsx`）到本地后端
- 「散点图生成器」为独立页面，复用已导入数据集手动选择 X/Y 轴，支持悬浮提示、点击点右侧详情联动与按数据集自动记忆配置
- 导入后的 Excel 数据集可在下拉菜单中切换
- 支持删除当前选中的导入数据集
- 导入后可在下拉菜单切换球员
- 支持按球员名关键字搜索后再从下拉菜单选择
- 搜索关键字与“选择球员”会按数据集分别缓存，切换回来可自动恢复
- 每列展示：列标题、该球员列值、全体球员排名、百分比
- 搜索输入后，“选择球员”会自动定位为当前筛选结果的第一项，并联动刷新下方数据
- 球员数据表格默认不显示 `player` 行，列标题按“中文（English）”展示（英文列名会从“项目对应表”映射）
- 球员数据表格会展示项目对应表里维护的 `group` 列
- 支持按数据集勾选指标列，一键导入到“雷达图生成器”并自动跳转
- 一键导入口径：`value=百分比`、`per90=该球员原始列值`
- 一键导入时 `metric` 优先使用项目对应表里的中文名（无中文映射则保留英文）
- 一键导入时若项目对应表里为该英文列配置了 `group`，则优先使用该 `group`（支持 `传球/对抗/防守/其他` 与 `passing/duel/defending`）
- 一键导入时会先按 `group` 分组再统一分配 `order`：优先 `传球/对抗/防守/其他`，其余分组按出现顺序追加；同 `group` 保持同 `order`
- 指标勾选结果按数据集分别记忆，切换数据集会自动恢复对应勾选
- Excel 约束：必须包含 `player` 列；按“宽表（一行一个球员）”读取；除 `player` 外的数值列自动参与排名
- 直接编辑标准字段：`metric,value,group,order,subOrder,per90,tier,color`
- 雷达图排序规则：`order -> group -> subOrder`（同组同序号再按 `metric` 兜底）
- 雷达图生成器数据表支持“上移/下移”逐行重排
- 行重排固定为“同步 order（图表跟随）”：移动行时会同步交换 `order`，右侧图表顺序立即变化
- `tier` 按 `value` 自动联动（不可手动编辑）：
- `value >= 90` => `elite`
- `65 <= value < 90` => `above_avg`
- `34 <= value < 65` => `avg`
- `value < 34` => `bottom`
- 标题模板一键生成（姓名/年龄/位置/分钟/球队/联赛/赛季）
- 从“球员数据”一键导入后，会自动把当前球员姓名应用到标题模板并同步更新主/副标题
- 一键导入时会自动识别出场时间列并写入标题模板第4格“分钟”（优先 `Minutes played`；未识别到则清空分钟）
- 图表字体与分组字号调整（主/副标题、指标、分组、per90、刻度、图例）
- 支持分组分隔线样式调节（线条粗细、长短、内外偏移位置）
- 实时自动保存当前草稿（后端优先 + 本地兜底）
- 同一后端地址下，跨 `127.0.0.1/localhost/不同前端端口` 读取同一份已保存数据
- 首次接入后端会自动迁移一次浏览器本地草稿/版本
- 保存命名版本并通过下拉切换
- 版本保存范围：`title/subtitle/rows/meta/textStyle/chartStyle/centerImage/cornerImage`
- 版本不保存：面板折叠状态、粘贴框临时文本
- 选中版本后，编辑会实时回写该版本，下拉可见更新时间
- 支持中心图片上传/替换/清除与大小调节（仅显示在中心圆内）
- 支持左上角图片上传/替换/清除，并可调大小与 X/Y 位置
- 中心图片与左上角图片都会随草稿与版本一起保存/恢复
- 标题模板/字体样式面板可折叠
- 上传 CSV 导入球员数据
- 粘贴 CSV 文本导入
- 下载当前 CSV（用于复现）
- 导出 SVG / PNG 图片

可选环境变量（前端）：

- `VITE_STORAGE_API_BASE`：后端地址，默认 `http://127.0.0.1:8787`

## 6. 架构审核（自动化阻断）

```bash
python3 scripts/audit_architecture.py
```

说明：
- 规则文件：`scripts/audit_rules.yml`
- 报告输出：`out/architecture_audit_report.json` 与 `out/architecture_audit_report.md`
- 任意违规会返回非零退出码（阻断）

## 7. GitHub 更新与 Tag 规范

详见：`docs/GITHUB_WORKFLOW_AND_TAGS.md`

常用命令：

```bash
# 日常分支开发
git checkout main
git pull origin main
git checkout -b feature/<topic>

# 提交并推送
git add .
git commit -m "feat: <message>"
git push -u origin feature/<topic>

# 发布 Tag（示例）
git checkout main
git pull origin main
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```
