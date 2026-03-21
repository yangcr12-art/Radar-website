# player-web（Web 图表工作台）

`player-web` 是 `player` 项目的交互前端，覆盖雷达图、散点图、数据导入与对应表维护。

技术栈：`React + Vite + TypeScript`

---

## 1) 启动

### 推荐：仓库根目录一键启动

```bash
bash scripts/start_player_web_dev.sh
```

### 手动启动

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

## 2) 页面导航

- 主页
- 数据雷达图（球员数据、雷达图生成器）
- 数据散点图（数据散点图、个人雷达图）
- 比赛数据总结（球队数据、比赛雷达图）
- 体能数据分析（两队体能雷达图、球员体能叠加雷达、分均体能数据）
- 对应表（项目对应表、比赛项目对应表、姓名对应表、球队对应表）
- About

品牌：`生成器V3.3`

---

## 3) 前端结构（优化后）

- `src/app/*`：应用级常量、页面注册表、跨页配置
- `src/pages/*`：页面组件（按功能域拆分）
- `src/components/*`：导航和可复用界面组件
- `src/api/*`：后端接口调用
- `src/hooks/*`：复用状态逻辑
- `src/utils/*`：纯函数、映射、格式化工具
- `src/styles.css`：样式入口（仅导入）
- `src/styles/*.css`：基础与通用样式
- `src/home-about.css`、`src/match-pages.css`：页面特化样式

约束：`src` 仅允许 `.ts/.tsx` 源码。

---

## 4) 行为口径（摘要）

- 平均线统计基于全量有效点，不受可见筛选影响
- 比赛雷达图使用主客队原始值，不使用排名/百分位
- 比赛雷达图 `PPDA` 采用反向映射（值越小越靠外）
- 比赛总结数据域与球员数据域隔离

完整行为定义见仓库根目录 `USAGE.md`。

架构分层约束见：`docs/ARCHITECTURE_RULES.md`。

---

## 5) 开发验证

```bash
cd player-web
npm run build
```

建议在仓库根目录补充：

```bash
python3 scripts/audit_architecture.py
python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/smoke_test.png \
  --title "Smoke Test" \
  --subtitle "Template Validation"
```

---

_最后更新：2026-03-18_
