# player

一个面向足球数据分析的可复用出图项目：
**把球员指标填进表格（CSV），自动导出雷达/径向分组图（pizza style）**。

> 项目目标不是做“一张图”，而是做“稳定、可复用、可批量”的图表模板系统。

---

## 0. 必读文档（开始改代码前）

1. `README.md`：项目定位、目录、最小闭环
2. `USAGE.md`：命令用法与参数说明
3. `AGENTS.md`：协作红线与交付规则
4. `contributing_ai.md`：AI 任务书与验收格式

文档扩展：
- `docs/PLAYER_CHART_TEMPLATE.md`：模板字段与出图细节
- `docs/ROADMAP.md`：版本计划与优先级

---

## 1. 快速开始（最小闭环）

### 1.1 安装依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install matplotlib numpy
```

### 1.2 使用模板生成图

```bash
python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/demo.png \
  --title "Player Name (Age, Position, Minutes)" \
  --subtitle "League Season Percentile Rankings & Per 90 Values"
```

---

## 2. 项目结构

```text
player/
├── scripts/
│   └── generate_player_radar.py      # 主出图脚本
├── templates/
│   └── player_chart_template.csv      # 填写模板
├── docs/
│   ├── PLAYER_CHART_TEMPLATE.md       # 字段说明/风格说明
│   └── ROADMAP.md                     # 规划
├── out/
│   └── player_charts/                 # 导出图片（建议加入 .gitignore）
├── README.md
├── USAGE.md
├── AGENTS.md
└── contributing_ai.md
```

---

## 3. 设计原则

- 模板优先：先定义输入表结构，再做图形渲染。
- 可复用：同一套命令可对任意球员批量出图。
- 可追溯：输入文件 + 命令 + 输出路径必须能复现结果。
- 最小惊讶：参数简洁，默认值可直接使用。

---

## 4. 当前能力

- 支持按分组绘制径向条形图（pizza/radar hybrid）
- 支持每个指标显示 percentile 与 per90 文本
- 支持 tier 自动配色与手动颜色覆盖
- 支持导出高分辨率 PNG

---

## 5. 下一步建议

1. 增加批量命令（目录扫描后自动导出全部球员图）
2. 增加主题配置（俱乐部配色、字体、背景风格）
3. 增加数据校验报告（缺失字段、异常值、重复指标）

---

## 6. 架构审核

项目提供架构自动审核脚本（阻断式）：

```bash
python3 scripts/audit_architecture.py
```

规则见 `docs/ARCHITECTURE_RULES.md` 与 `scripts/audit_rules.yml`。
