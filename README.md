# player

一个面向足球数据分析的可复用出图系统：  
**CSV/Excel 输入 -> 雷达图与散点图分析 -> 可复现导出与规则化协作**。

> 目标不是“临时做一张图”，而是“稳定、可审计、可复现、可持续迭代”的图表系统。

---

## 0. 必读文档（改代码前）

1. `README.md`：项目定位、最短闭环、文档地图
2. `USAGE.md`：命令与功能行为事实源
3. `AGENTS.md`：红线与口径契约（最高优先级）
4. `contributing_ai.md`：AI 任务书与交付格式

扩展文档：
- `docs/PLAYER_CHART_TEMPLATE.md`
- `docs/ARCHITECTURE_RULES.md`
- `docs/ROADMAP.md`
- `docs/GITHUB_WORKFLOW_AND_TAGS.md`
- `player-web/README.md`

---

## 1. 10 分钟最短闭环

### 1.1 CLI（模板出图）

```bash
python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/demo.png \
  --title "Player Name (Age, Position, Minutes)" \
  --subtitle "League Season Percentile Rankings & Per 90 Values"
```

### 1.2 Web（可交互分析）

```bash
# 后端
cd player-web/server
python3 -m pip install -r requirements.txt
python3 app.py

# 前端
cd ../
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

打开：`http://127.0.0.1:5173`

---

## 2. 项目结构

```text
player/
├── scripts/
│   ├── generate_player_radar.py
│   └── audit_architecture.py
├── templates/
│   └── player_chart_template.csv
├── docs/
│   ├── PLAYER_CHART_TEMPLATE.md
│   ├── ARCHITECTURE_RULES.md
│   ├── ROADMAP.md
│   └── GITHUB_WORKFLOW_AND_TAGS.md
├── player-web/
│   ├── src/
│   ├── server/
│   └── README.md
├── out/
├── README.md
├── USAGE.md
├── AGENTS.md
└── contributing_ai.md
```

---

## 3. 当前能力（V3.3）

- 雷达图：模板化输入、分组排序、自动 tier、SVG/PNG 导出
- 球员数据页：导入 Excel、排名/百分比计算、一键导入雷达图
- 散点图生成器：X/Y 轴选择、筛选、平均线、样式控制、球员详情联动
- 项目对应表：字段中英映射与分组维护
- 姓名对应表：球员中英姓名映射维护，支持 Excel 导入姓名+球队中文映射与中文名补全
- 图表姓名联动：散点图显示优先中文名，雷达标题支持 `English 中文`（空格分隔）
- 球队对应表：球队中英映射、颜色/形状维护、同步球员数据球队
- 散点图球队样式联动：按球队映射应用颜色/形状，未匹配回退黑色

---

## 4. 核心原则

- 模板优先：先定义输入字段，再设计展示
- 口径稳定：统计规则优先于 UI 效果
- 可追溯：每个展示值可追溯到原字段
- 可复现：命令、输入、输出路径可复跑
- 可审计：默认值与语义变化必须落文档

---

## 5. 经验教训（摘要）

1. 筛选与统计基准必须分离
- 可见点过滤不应改变全局统计口径（如平均线）。

2. 布局优化不能改变业务行为
- UI 居中/容器策略不能导致交互语义漂移。

3. 回退策略必须文档化
- 缺列、未匹配、空值都必须有明确且可预测的回退。

4. 默认值是产品规则的一部分
- 默认开关、默认样式、默认排序都必须在 `USAGE.md` 可查。

---

## 6. 最低验证

```bash
python3 scripts/audit_architecture.py

python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/smoke_test.png \
  --title "Smoke Test" \
  --subtitle "Template Validation"
```

Web 改动建议补充：

```bash
cd player-web
npm run build
```

---

_最后更新：2026-03-03_
