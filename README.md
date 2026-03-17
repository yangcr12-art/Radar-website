# player

一个面向足球数据分析的可复用出图系统：
**CSV/Excel 输入 -> 雷达图与散点图分析 -> 可复现导出 -> 规则化协作**。

> 本仓库强调“稳定口径 + 可审计 + 可复现”，不是一次性临时出图脚本。

---

## 0. 必读文档

按以下顺序阅读：

1. `AGENTS.md`（最高优先级规则）
2. `USAGE.md`（命令与行为事实）
3. `README.md`（项目总览）
4. [`docs/DOCUMENTATION_MAP.md`](docs/DOCUMENTATION_MAP.md)（文档地图）

扩展文档：
- `contributing_ai.md`
- `player-web/README.md`
- `docs/PLAYER_CHART_TEMPLATE.md`
- `docs/ARCHITECTURE_RULES.md`
- `docs/ROADMAP.md`
- `docs/GITHUB_WORKFLOW_AND_TAGS.md`

---

## 1. 10 分钟最短闭环

### 1.1 CLI（模板雷达图）

```bash
python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/demo.png \
  --title "Smoke Test" \
  --subtitle "Template Validation"
```

### 1.2 Web（交互分析）

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

## 2. 当前能力（V3.3）

- 雷达图生成器：模板编辑、样式控制、SVG/PNG 导出
- 球员数据：Excel 导入、排名/百分比、勾选导入雷达图
- 散点图生成器：坐标选择、筛选、平均线、样式联动
- 对应表体系：项目/比赛项目/姓名/球队 映射维护
- 比赛总结：球队数据独立域 + 比赛雷达图双队对比
- 球队样式能力：颜色/形状/logo 映射并联动展示
- 前端源码统一 TypeScript（`player-web/src` 仅 `.ts/.tsx`）

详细行为见：`USAGE.md`

---

## 3. 结构总览

```text
player/
├── scripts/
├── templates/
├── docs/
├── player-web/
│   ├── src/
│   └── server/
├── out/
├── README.md
├── USAGE.md
├── AGENTS.md
└── contributing_ai.md
```

---

## 4. 框架约束（摘要）

- 统计口径优先于视觉效果
- 筛选范围与统计基准必须分离
- 默认值/回退策略变化必须同步文档
- 后端改动需重启并验证 `/api/health`
- 前端仅 TypeScript，禁止新增 `.js/.jsx`

详细规则见：`AGENTS.md` 与 `docs/ARCHITECTURE_RULES.md`

---

## 5. 最低验证命令

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

_最后更新：2026-03-18_
