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

- 工作台界面：按用户确认恢复原暖色界面与紧凑控件；雷达生成器使用左侧编辑/数据表、右侧固定居中预览。当前功能和数据保留，详见 `docs/LEGACY_APPEARANCE_RESTORE.md`。

- 数据雷达图：球员数据导入、标准/算法百分位选择、模板编辑、SVG/PNG 导出
- 数据散点图：筛选、样式、平均线、个人雷达联动
- 比赛数据总结：球队数据与比赛雷达图双队对比
- 体能数据分析：两队体能雷达、球员叠加雷达、分均体能数据、个人多场体能（批量上传、逐场记录与场均汇总）
- Opta 数据分析：导入 PDF（主队第5页/客队第6页）并查看进攻/防守概况排序表
- 中超积分走势：导入赛程 Excel，按赛果自动累计每轮积分/排名/进球/丢球并查看多队走势（支持 2026 赛季扣分口径）
- StatsBomb 分析：独立支持 StatsBomb Classic Scout CSV 与商业 API；CSV 模式可浏览球员、门将、OBV 和 360 派生指标，API 模式提供比赛目录、StatsBomb 覆盖积分表、球队/球员赛季统计和球队比较；两种模式均不写入现有数据集
- 球探搜索：复用球员数据集，以可审计职责模型生成球员评分；包含八个位置族共27个公开中文Research能力模型。支持项目级百分位、闭环贡献、足侧规则、分钟可靠度、模块排名、隐藏/展开和逐指标解释；“职责算法库”读取实际维度、指标和权重。全部职责逐指标应用尖点奖励；次数与成功率配对时，对抗、空中对抗、盘带、进攻对抗、传中和射门转化使用量效耦合。前腰、中前卫、后腰均为五维能力模型，分别要求明确AMF、RCMF/LCMF/CMF、DMF/RDMF/LDMF标记。职责相似度、能力分和可信度分离；中卫使用七个行为支柱加一张非计分位置说明卡，其余已实现位置使用八项行为或结构证据。半中卫仍以双位置兼容50%与行为50%验证。球权丢失优先读取真实Losses per 90，缺列仅估算传球失误并标明边界。
- 边后卫保留防守、进攻、攻守均衡、边翼卫四职责；中卫仅保留上抢、拖后、出球三项独立相似度。CB按用户确认的项目编码确认居中兼容，不给拖后加分；LB+LCB、RB+RCB确认同侧边中卫兼容，只作徽标与筛选，不计分、不计入中卫七支柱覆盖率。历史边中卫能力API隐藏保留。位置列仍为原始英文缩写，侧别与兼容性筛选不改变完整位置族评分、百分位及整体排名。边翼卫仍读取位置支持与行为，防守型仍有防守主导调节。详见[后卫职责模型](docs/DEFENDER_ROLE_MODELS.md)和[中卫位置兼容性变更](docs/CENTRE_BACK_COMPATIBILITY.md)。
- 对应表：项目/比赛项目/姓名/球队映射维护

门将现已补齐扑救型、出球型两项独立职责相似度、八个行为支柱与两套四维能力模型（已移除控球与纪律），算法库及搜索页面保持统一格式。类型识别不读取扑救质量，数据可信度独立展示；受字段与球队环境限制，属于Research行为代理。详见[门将职责模型与交付审计](docs/GOALKEEPER_ROLE_MODELS.md)。

门将行为v2改用实际短中传、接球和直接处理结构，接回传专属字段不再参与识别；被射门只作5%辅助，不再决定扑救型准入。两类保留独立核心强度门槛，不能把缺乏组织证据自动当作扑救型；能力评分权重不变。

边后卫四职责当前为进攻型、防守型、攻守均衡型、边翼卫。攻守均衡型已替换内收型识别与能力权重，以两端行为参与为必要核心，组织接应/传球推进为辅助；主职责旁进攻方式标签不重复计分。旧技术ID仅为保存选择兼容保留，不能把新分数解释为内收能力。

四类边后卫能力评分的防守对抗已统一为修正有效性，进攻型边路防守18%、被犯规2%；防守型加入反向球权丢失（缺列时明确标注估算传球失误）。删项与逐指标配权见后卫职责模型文档，八支柱及职责相似度不变。

三类中卫对抗、空中对抗、防守对抗均仅使用可靠度修正成功率百分位，次数只用于可靠度，不直接加分；总对抗与防守对抗分别保留权重，不去重。长传仍使用修正长传有效性；上抢型PAdj滑铲7%。出球型移除盘带、传球数与接球数；拖后型身体对抗35%、回追覆盖15%。逐项权重见 `docs/DEFENDER_ROLE_MODELS.md`，不改变职责相似度及位置兼容性。

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

_最后更新：2026-10-08_
