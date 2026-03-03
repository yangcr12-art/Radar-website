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

```bash
# 1) 后端
cd player-web/server
python3 -m pip install -r requirements.txt
python3 app.py

# 2) 前端
cd ../
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

可选环境变量：

- `VITE_STORAGE_API_BASE`：后端地址，默认 `http://127.0.0.1:8787`

---

## 4. Web 功能行为（按页面）

## 4.1 导航

顶部导航七页面：

- 主页
- 雷达图生成器
- 球员数据
- 散点图生成器
- 项目对应表
- 球队对应表
- About

左上角品牌文案：`生成器V3.3`

## 4.2 球员数据

- 支持导入 Excel（`.xlsx`）
- 必须包含 `player` 列，按宽表读取（一行一个球员）
- 数值列自动参与排名与百分比
- 支持按数据集切换、删除、搜索球员、选择球员
- 支持按数据集勾选指标，一键导入雷达图生成器

一键导入口径：

- `value = 百分比`
- `per90 = 该球员原始列值`
- `metric` 优先使用项目对应表中文名
- `group` 优先使用项目对应表配置

## 4.3 散点图生成器

基础能力：

- 选择 X/Y 轴
- 按范围筛选点
- 悬浮提示、点选联动详情
- 显示球员名字开关
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

## 4.4 项目对应表

- 维护 Excel 列的中英映射
- 支持维护 `group`
- 支持下载对应表 CSV

## 4.5 球队对应表

- 维护球队英文名/中文名
- 维护 `color` 与 `shape`
- 支持颜色与形状示意
- 支持“从球员数据同步球队”（增量合并，不覆盖已填中文）
- 刷新后保留（本地持久化）

---

## 5. 默认值与回退表

- 散点图“样式”面板默认：收起
- 散点图“显示控制”面板默认：收起
- 散点图平均线默认：显示
- 球队映射未命中：黑色
- 球队形状未配置或非法：回退圆形
- 数据集无球队列：不启用球队样式

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

- `out/architecture_audit_report.json`
- `out/architecture_audit_report.md`

任一规则违规，命令返回非零退出码。

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
  - 散点图球队映射颜色/形状口径明确
  - 散点图平均线统计与筛选口径分离并文档化
  - 文档体系升级为规则化操作手册

---

_最后更新：2026-03-03_
