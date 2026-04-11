# player

足球数据分析与出图工作台，覆盖：
`CSV/Excel 导入 -> 交互分析 -> 可复现导出 -> 规则化协作`。

> 设计基线：稳定口径、可审计、可复现、最小复杂度。

---

## 1. 阅读顺序（强制）

1. `AGENTS.md`：最高优先级规则与红线
2. `USAGE.md`：命令与功能行为事实源
3. `README.md`：项目入口与快速闭环
4. [`docs/DOCUMENTATION_MAP.md`](docs/DOCUMENTATION_MAP.md)：文档导航

扩展文档：
- `contributing_ai.md`
- `player-web/README.md`
- `docs/ARCHITECTURE_RULES.md`
- `docs/PLAYER_CHART_TEMPLATE.md`
- `docs/ROADMAP.md`
- `docs/GITHUB_WORKFLOW_AND_TAGS.md`

---

## 2. 10 分钟最短闭环

### 2.1 CLI（模板雷达图）

```bash
python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/demo.png \
  --title "Smoke Test" \
  --subtitle "Template Validation"
```

### 2.2 Web（交互分析）

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

访问：`http://127.0.0.1:5173`

---

## 3. 当前能力（摘要）

- 数据雷达图：球员数据导入、模板编辑、SVG/PNG 导出
- 数据散点图：筛选、样式、平均线、个人雷达联动
- 比赛数据总结：球队数据与比赛雷达图双队对比
- 体能数据分析：两队体能雷达、球员叠加雷达、分均体能数据
- Opta 数据分析：导入 PDF（主队第5页/客队第6页）并查看进攻/防守概况排序表
- 中超积分走势：导入赛程 Excel，按赛果自动累计每轮积分/排名/进球/丢球并查看多队走势（支持 2026 赛季扣分口径）
- 对应表：项目/比赛项目/姓名/球队映射维护

完整行为定义统一在 `USAGE.md`。

---

## 4. 项目结构

```text
player/
├── scripts/                  # CLI 与审核脚本
├── templates/                # 模板 CSV
├── docs/                     # 规则与路线文档
├── player-web/               # Web 前后端
│   ├── src/                  # React + TypeScript
│   └── server/               # Flask API
├── out/                      # 导出与审计产物
├── AGENTS.md
├── USAGE.md
├── README.md
└── contributing_ai.md
```

---

## 5. 设计与架构原则

本仓库采用“少即是多”的工程实践：
- 同一行为口径只在一个事实源定义（`USAGE.md`）
- 样式优化不改变统计语义
- 状态与业务规则分层管理，避免跨页耦合
- 默认值/回退策略变更必须文档同步

详细规则见：`AGENTS.md` 与 `docs/ARCHITECTURE_RULES.md`。

---

## 6. 最低验证命令

```bash
python3 scripts/audit_architecture.py

python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/smoke_test.png \
  --title "Smoke Test" \
  --subtitle "Template Validation"
```

涉及 Web 改动时建议补充：

```bash
cd player-web
npm run build
```

---

_最后更新：2026-03-21_
