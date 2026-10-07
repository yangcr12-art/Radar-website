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

本地开发登录补充：

- 若未配置 `PLAYER_WEB_AUTH_FILE` / `PLAYER_WEB_LOGIN_USERNAME`，后端默认提供 3 个本地账号：`player/player`、`jishubu/123456`、`guest/guest`
- 登录后进入当前账号独立的数据空间；三个账号的工作台状态、导入数据集、映射表、预设互不影响

### 2.3 Web（生产部署到云服务器）

面向 Ubuntu 24.04 云服务器的生产部署资产已新增到：

```text
deploy/player-web-prod/
```

默认生产方案：

- 前端静态构建，由 `Nginx` 提供
- 后端使用 `gunicorn` 单进程绑定 `127.0.0.1:8787`
- `Nginx` 反代 `/api/*`
- 站点进入后先显示共享账号登录页；登录成功后进入当前账号独立的数据空间

服务器执行入口：

```bash
sudo bash deploy/player-web-prod/scripts/install_player_web_prod.sh
```

更新入口：

```bash
sudo bash deploy/player-web-prod/scripts/update_player_web_prod.sh
```

---

## 3. 当前能力（摘要）

- 数据雷达图：球员数据导入、标准/算法百分位选择、模板编辑、SVG/PNG 导出
- 数据散点图：筛选、样式、平均线、个人雷达联动
- 比赛数据总结：球队数据与比赛雷达图双队对比
- 体能数据分析：两队体能雷达、球员叠加雷达、分均体能数据
- Opta 数据分析：导入 PDF（主队第5页/客队第6页）并查看进攻/防守概况排序表
- 中超积分走势：导入赛程 Excel，按赛果自动累计每轮积分/排名/进球/丢球并查看多队走势（支持 2026 赛季扣分口径）
- StatsBomb 分析：独立支持 StatsBomb Classic Scout CSV 与商业 API；CSV 模式可浏览球员、门将、OBV 和 360 派生指标，API 模式提供比赛目录、StatsBomb 覆盖积分表、球队/球员赛季统计和球队比较；两种模式均不写入现有数据集
- 球探搜索：复用球员数据集，以可审计职责模型生成球员评分；现包含中锋、边锋、前腰、中前卫、后腰、边后卫、中卫、门将共 26 个中文 Research 职责模型，并支持项目级百分位算法、闭环贡献、足侧规则、分钟可靠度修正、模块组合排名、球员隐藏/展开和逐指标解释；导航下的“职责算法库”可按位置和职责查看当前实际维度、指标与权重。全部职责逐指标应用尖点奖励；当同一职责同时包含次数与成功率时，对抗、空中对抗、盘带、进攻对抗、传中和射门转化自动使用量效耦合。前腰、中前卫与后腰三类能力模型均固定为5个维度并单列身体对抗；前腰只接纳位置记录明确包含AMF的球员，中前卫只接纳明确包含RCMF、LCMF或CMF的球员，后腰只接纳明确包含DMF、RDMF或LDMF的球员。中锋、边锋、前腰、中前卫和后腰分别提供各自的八项行为或结构证据支柱、互不归一化的职责相似度、数据可信度与职责区分度，并与职责能力分分离；半中卫优先读取后腰与中卫双位置兼容性，不再使用回传/封堵代理空间站位。职责能力分中的球权丢失优先读取真实Losses per 90，源表缺列时只以可追溯公式估算传球失误并明确标注边界
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

当前重构后的关键落点：
- `player-web/src/App.tsx`：应用壳层与跨页面桥接
- `player-web/src/hooks/useSharedAuth.ts`：共享登录态与账号级 storage scope 同步
- `player-web/src/hooks/useRadarEditorController.ts`：雷达图生成器编辑状态、导出与本地草稿控制
- `player-web/src/app/radar/*`：雷达图生成器专用规则、归一化和本地持久化工具
- `player-web/src/components/RadarEditorPage.tsx`：雷达图生成器视图层
- `player-web/server/app.py`：仅保留 Flask 入口、CORS 与蓝图注册
- `player-web/server/server_core/routes/*` / `services/*`：后端路由编排与数据读写规则
- 账号级持久化按数据域隔离：`state.json` 保存工作台草稿/预设，`mappings.json` 保存四张对应表，各自维护独立 `.bak`，避免不同自动保存流程整文件互相覆盖

---

## 5. 设计与架构原则

本仓库采用“少即是多”的工程实践：
- 同一行为口径只在一个事实源定义（`USAGE.md`）
- 样式优化不改变统计语义
- 状态与业务规则分层管理，避免跨页耦合
- 默认值/回退策略变更必须文档同步

重构任务执行基线（Behavior-Preserving Refactor）：
- 先重排结构，再考虑视觉；不在同一提交混入行为变更
- 对外接口、字段语义、持久化键名默认保持不变
- 每次重构必须附带行为不变性清单与验证命令结果
- 可拆分超大文件，但不得借结构调整修改产品行为或统计口径

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

_最后更新：2026-10-07_
