# 边后卫与中卫职责模型（Research）

## 两类边后卫终结指标交付审计（2026-10-08）

本轮只修改本文件、USAGE.md、player-web/server/server_core/services/scouting_role_catalog.py、player-web/server/tests/test_defender_role_analysis.py，保留已有未提交修改。进攻型版本attacking-fullback-v5-finishing，均衡型balanced-fullback-v3-finishing；默认能力权重变化见下方现行配置，原始字段、value百分位语义与接口不变。两类能力分及排序可能改变，八支柱、相似度、标签、左右筛选、分页、其他职责及存储不变；无重构或前端结构调整。

已运行通过：`cd /Users/yangchangran/xiangmu/player-web/server && python3 -m unittest discover -s tests`（89项）；`cd /Users/yangchangran/xiangmu/player-web && npm run build`；仓库根目录`python3 scripts/audit_architecture.py`；`MPLBACKEND=Agg python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title 'Smoke Test' --subtitle 'Template Validation'`；`git diff --check`。后端通过server目录`python3 app.py`重启，`curl -s --fail http://127.0.0.1:8787/api/health`返回ok:true。

回归验证涵盖：两类仍五维且合计100%，新增项放入指定现有维度，修正来源合并3%，低数量高转化收缩，缺失转化率中性处理不伪造数据，贡献闭环，改变进球/转化率不改变行为分类，其他两类边后卫不新增终结指标。目录及评分通过同源配置自动更新，不新增前端公式。未进行本轮浏览器人工视觉核对（无布局改动）；未推送、部署或做远端验证（本轮未请求），未进行录像标注校准，仍为Research。Vite保留既有500kB体积提示；Matplotlib临时缓存提示后出图成功。

参考：AGENTS.md第0/1/6/7/8节、README.md项目与文档地图、USAGE.md第4.15/9节、contributing_ai.md任务模板与交付协议。

## 任务与验收

### 当前任务：两类边后卫增加终结指标（2026-10-08）

Goal：进攻型与攻守均衡型的现有维度加入非点球进球/90和修正射门转化有效性，合计6%。
DoD：各占3%；不新增维度；两套模型五维及总权重100%不变；目录与评分同源，修正及逐指标尖点生效，贡献闭环；分类不受影响。
Scope：只改两套能力配置、测试和说明；不改八支柱、相似度、其他职责、存储或远端部署。“攻守兼备型”对应现有攻守均衡型，不新增名称。
Implementation Notes：进攻型放在边路输出27%，均衡型放在进攻推进与边路输出25%；所在维度原六个来源项各减1个百分点。非点球进球3%；射门2%与转化率1%合并为修正射门转化有效性3%，不独立重复计分。沿用既有20次先验和35/45/20量效合成，来源权重2/1不改变合成公式。
Files：scouting_role_catalog.py、test_defender_role_analysis.py、USAGE.md、本文件。
Commands / Tests：完整后端测试、Web构建、架构审计、模板出图、差异检查、后端重启健康检查。
Risks：两类能力分及排序会变化；非点球进球和射门转化相关，合计仅6%作为补充，不应解释为独立证据或改变行为分类。继续为Research。

### 当前任务：四类边后卫能力指标细化（2026-10-08）

Goal：按用户要求删减能力指标，四类边后卫防守对抗统一修正为量效耦合。
DoD：四套五维能力权重各100%；评分、排名详情及算法库同源；丢失球权反向且来源可追溯；分类与其他位置不受影响；测试、构建、审计、出图、重启健康检查通过。
Scope：仅四类边后卫能力配置及防守对抗配对；不改八支柱、相似度、侧别、分类、存储，不推送或部署。
Implementation Notes：防守对抗沿用20次先验的贝叶斯修正和35%次数＋45%修正成功次数＋20%修正成功率，计一次尖点。防守型球权丢失5%，真实Losses per 90优先，缺列沿用已有传球失误估算并提示边界；来源仍不足则中性缺失，不填零。进攻型五维改13/27/24/18/18；其他三类维度总比例不变，删除项在维度内配平。
Files：本文件、USAGE.md、README.md、scouting_role_catalog.py、scouting_model.py、forward_role_analysis.py、test_defender_role_analysis.py、ForwardArchetypeMethodPage.tsx、ScoutSearchPage.tsx。
Commands / Tests：后端完整测试、Web构建、架构审计、模板出图、git diff --check、后端重启及健康检查，复现命令见末尾。
Risks：四类能力分及排序会变化；球权丢失缺列估算只含传球失误，不是完整球权丢失；配权仍为Research。

### 当前任务：以攻守均衡替换内收（2026-10-08）

Goal：边后卫正式采用进攻型、防守型、攻守均衡型、边翼卫；替换旧内收识别和能力模型。
DoD：下拉、排名、详情、算法库一致；攻守都低不等于均衡；单端高不能补偿短板；组织与推进保留辅助作用；测试及健康检查通过。
Scope：修改原第三职责名称、相似度及五维能力权重；其他三类公式、中卫、原始数据、存储不变，不部署。
Implementation Notes：保留旧inverted_fullback技术ID以兼容已保存选择，不再代表内收。进攻参与=传中40%＋持球35%＋传球推进25%；均衡核心为进攻与防守几何均值，两端各至少40且差至多20分，核心有实质行动；基础=核心70%＋接应组织15%＋传球推进10%＋往返5%；再乘均衡系数1−0.5×min(1,攻守差/40)。缺少任一进攻来源则不确认均衡，保留诊断分。阈值与权重为Research规则，不能证明空间站位。
Files：defender_role_analysis.py、scouting_role_catalog.py、test_defender_role_analysis.py、test_scouting_model.py、ScoutSearchPage.tsx、DefenderArchetypeMethod.tsx、USAGE.md、README.md、本文件。
Commands / Tests：后端完整测试、前端构建、架构审计、模板出图、后端重启与健康检查。
Risks：规则尚需真实球员人工验证；本职责能力分、相似度及相关标签/排序会重新计算。

Goal：两类后卫各建立七个行为支柱和一个位置兼容性支柱，分别计算四项独立职责匹配度，复用中锋/边锋格式。
DoD：兼容性不经过群体百分位；同侧完整兼容与单一位置明确区分；新职责必须同时有位置及行为证据；旧三职责不读取兼容性；八套能力权重、完整位置族百分位不变；说明与代码同源；测试、构建、审计、出图及健康检查通过。
Scope：将边翼卫/边中卫纳入职责识别，取消仅限位置资格的入榜过滤；调整被替换支柱涉及的公式和行为归并；不改其他位置模型、不迁移用户数据、不推送或部署。

2026-10-08前次增量任务：排名位置恢复源表英文缩写；边路防守支柱成功防守动作升至40%；细化三类边后卫行为重点。中卫公式、能力权重与用户原始数据不变。

### 当前任务：方向支持与连续行为调节

Goal：执行用户选择的方案二，减少单纯防守动作多被判防守型、位置组合自动被判翼卫的问题。
DoD：单翼卫/翼卫加边锋/翼卫加边后卫区别明确；同侧FB加边锋可以凭更强行为证据参与判断；调节曲线连续；缺失不视为低进攻；说明与计算同源；测试及健康检查通过。
Scope：仅边后卫职责相似度、位置支持规则和解释UI；不改变能力权重、可信度公式、中卫模型、原始输入、存储或远端部署。
Implementation Notes：0–1内部计算、页面0–100；沿用wingback_compatibility接口键，但语义改为方向支持。初始曲线为Research规则，不是标注数据拟合，不设置类型人数配额。缺字段保留诊断分并禁止相关标签竞争。
Files：defender_role_analysis.py、test_defender_role_analysis.py、DefenderArchetypeMethod.tsx、ScoutSearchPage.tsx、README.md、USAGE.md、本文件。
Commands / Tests：见末尾可复现命令。
Risks：整季多位置汇总不能还原各位置分钟、真实站位或球队环境，需熟悉球员验证。

## 分型决策与边界

### 补充任务：进攻方式说明（不计分）

Goal：在边后卫主职责旁增加“偏边路输出”或“偏组织推进”，解释进攻路径而非新增职责。
DoD：排名与详情浅色标签一致；后端公式同源；缺失或接近不强制贴标签；原评分、标签、可信度和排序逐值不变。
Scope：只增加说明字段与UI，不改内收型分类、不改能力权重、不部署。
Implementation Notes：边路路径=传中输出55%＋持球推进45%；组织路径=接应组织35%＋传球推进65%。复用现有0–100支柱分，四项均可用、各覆盖至少50%且各有正值行为时才比较；领先至少10分且领先路径至少50分才显示偏向，主职责不足或不突出时不显示。未展示时返回原因，缺失不填零。阈值为Research初始规则，不是概率。
Files：本文件、USAGE.md、defender_role_analysis.py、test_defender_role_analysis.py、ScoutSearchPage.tsx、DefenderArchetypeMethod.tsx、scout-search.css。
Commands / Tests：完整后端测试、Web构建、架构审计、雷达冒烟、后端重启和健康检查；具体结果见交付。
Risks：聚合行为只能解释相对路径，不能证明具体内收站位；不单独奖励同一指标。

位置身份、侧别、职责匹配和职责能力分开。边后卫四类为防守型、进攻型、攻守均衡型、边翼卫；中卫三类为上抢型、拖后型、出球型，各项独立0–100分。中卫第八张卡片改为不计分的位置兼容性说明，七个行为支柱参与评分与覆盖率。边中卫移出职责下拉框，仅作兼容性说明及筛选；旧能力API隐藏保留，不输出第四相似度。上方与末尾旧任务记录保留历史，不代表当前口径。
边翼卫位置支持最高占50%，经过行为支持调节，结构门槛50分；行为核心通常至少40分，仅FB加同侧边锋代理至少60分。边中卫不再有结构得分或准入阈值。中卫三项原能力和相似度公式不变；主标签与区分度可能因竞争集合减少而改变。

### 位置兼容性绝对规则

本分数是Research规则刻度，不是概率或群体百分位；同一球员分数不随其他球员位置分布改变，位置顺序也不改变此分。

| 支柱 | 100分完整证据 | 较弱证据 | 低基准 |
| --- | --- | --- | --- |
| 边翼卫位置支持 | WB＋同侧边锋100分 | WB同侧没有FB/边锋90分；WB＋同侧FB但无边锋65分；同侧FB＋边锋无WB50分代理 | 只有FB或仅跨侧兼容20分 |
| 中卫位置说明（不计分） | CB确认居中；LB＋LCB确认左侧边中卫；RB＋RCB确认右侧边中卫 | CB＋LB/RB但无对应LCB/RCB为兼容待确认 | 跨侧或RWB＋RCB不确认同侧边中卫 |

缺少本位置族记录时位置支持不可用，不填零。翼卫支持至少50分才进入标签竞争，50分代理还须行为核心至少60分；其他翼卫核心至少40分。中卫兼容性只输出说明，不生成公开数值分，不参与覆盖率。多侧兼容保留所有确认侧，不推算主要侧分钟。这些Research规则不是类别人数配额，也不证明战术事实。

### 位置与侧别显示

- LB/LWB确认左路，RB/RWB确认右路；LCB确认左侧中卫，RCB确认右侧中卫。
- 按用户确认的本项目编码，CB始终确认居中兼容，不依赖比较池分布；这不是对所有供应商编码的通用断言，混用数据时需重新核实。
- CB从不直接提高拖后相似度，站位与阵型必须另外核实。
- 没有分位置分钟时，双侧/多位置兼容者保留所有确认侧，不推算主要侧或时间占比。各侧榜均可包含同一球员，全部榜只出现一次。
- 每项职责侧榜使用本位置族全部确认侧。RB+RCB+LCB的位置身份为左侧/右侧中卫，另标兼容右侧边中卫；整体职责分来自整季聚合数据，不可解读为各侧职责已经验证。
- 先在完整位置族计算百分位；侧别和边中卫兼容性筛选在显示层取交集，分数和整体排名不变。兼容性可选不限、左侧、右侧、双侧、待确认；侧榜名次间隔不是漏排。
- 排名位置列原样显示源表英文缩写；行为职责另列。详情如“右侧中卫｜出球型”，旁边单列“兼容右侧边中卫”徽标；有CB则另显示“居中兼容”。

参考：[翼卫职责](https://learning.coachesvoice.com/cv/wing-backs-football-tactics-explained-conte-tuchel/)、[三中卫职责](https://learning.coachesvoice.com/cv/back-three-explained-why-conte-moyes-guardiola/)。

## 计算口径

事件行为＝70%×行动占比普通百分位＋30%×每90分钟数量普通百分位。总行动优先Total actions per 90，其次将Total actions按分钟换算，否则以传球＋对抗＋盘带＋射门做代理（至少两项可用且合计大于零）。缺少分母时仅保留数量，覆盖记30%。代理有语义重叠风险，不称为真实总行动量。
PAdj、距离、速度及结构比例直接使用普通百分位；单项至少8个有效样本。缺失不填零，真实零值保留；按可用权重重算并降低覆盖率。
相似度不读取成功率、进球、助攻、能力分或尖点。成功防守动作与拦截仍是有限代理，并不是纯空间行为。
至少4个行为支柱可用才启动识别，位置支持不计入这四项；必要核心必须可用，防守型还要求进攻对比支柱可用，否则只保留基础诊断分。辅助不得替代核心；边翼卫须满足结构与行为门槛。边后卫位置支持仍计入字段覆盖，中卫位置兼容性不计入覆盖。
最高分低于45为职责特征不突出，默认一个主职责。两项均≥70且差≤3，或均≥65且差≤2才显示复合型。
数据可信度＝字段平均覆盖率×min(1,分钟/满可靠度分钟)×位置可靠度；边后卫取八支柱均值，中卫取七个行为支柱均值。位置族为第一、第二、第三及以后位置分别100%、75%、55%。
职责区分度＝min(1,第一与第二相似度差/20)。可信度和区分度不参与相似度或能力评分。

## 边后卫

明确独立位置标记：RB、LB、RWB、LWB。

| 支柱 | 指标内部权重 |
| --- | --- |
| 身体参与 | 每90分钟对抗 45%；每90分钟空中对抗 30%；每90分钟被犯规 25% |
| 边路防守 | 每90分钟防守对抗 30%；每90分钟成功防守动作 40%；PAdj 拦截 20%；PAdj 滑铲 10% |
| 传中输出 | 每90分钟传中 70%；每90分钟传入小禁区的传中 30% |
| 持球推进 | 每90分钟盘带 40%；每90分钟推进跑动 40%；每90分钟进攻对抗 20% |
| 接应组织 | 每90分钟传球 35%；每90分钟接球 30%；每90分钟长传 15%；长传占总传球比例 20% |
| 传球推进 | 每90分钟推进传球30%；传入前场三区20%；向前传球10%；向前传球比例20%；关键传球10%；助攻射门传球5%；传入禁区5% |
| 纵向往返 | 每90分钟总距离 25%；每90分钟高强度距离 20%；每90分钟冲刺距离 25%；每90分钟加速 20%；最高速度 10% |
| 边翼卫位置支持 | 位置方向支持绝对规则分100%，不计算百分位 |

| 职责 | 相似度公式 | 识别边界 |
| --- | --- | --- |
| 防守型边后卫 | (65%×边路防守 + 20%×身体参与 + 15%×接应组织)×防守主导系数 | 防守与进攻参与比较，缺少对比字段只保留诊断分。 |
| 进攻型边后卫 | 65%×√(传中输出×持球推进) + 25%×传球推进 + 10%×纵向往返 | 提高进攻输送比重，降低跑动负荷干扰；进攻行为不读取兼容性。 |
| 攻守均衡型边后卫 | (70%×√(进攻参与×边路防守) + 15%×接应组织 + 10%×传球推进 + 5%×纵向往返)×均衡系数 | 进攻参与=传中40%＋持球35%＋传球推进25%；两端各≥40且差≤20，各有实质行动；均衡系数=1−0.5×min(1,绝对攻守差/40)。字段缺失不作低参与；接应与推进不能补偿单端短板。 |
| 边翼卫 | 50%×边翼卫位置支持×行为支持系数 + 30%×√(传中输出×纵向往返) + 20%×持球推进 | 位置支持至少50分，代理行为核心至少60分，其余至少40分。 |

连续调节（支柱分0–100）：进攻参与=传中40%＋持球35%＋传球推进25%；防守主导差=防守−进攻参与；防守主导系数=0.25+0.75×clamp((差+20)/30,0,1)。差≥10完整保留，差0保留75%，差≤−20保留25%。低进攻本身不加防守分，基础防守分仍必要。翼卫行为支持系数=clamp((√(传中×往返)−20)/50,0,1)，核心20及以下位置贡献为0、70及以上完整保留。只衰减位置项，不重新归一化放大行为项；辅助缺失按原可用权重分母重算并降低覆盖。

### 五项能力维度与逐指标权重

以下是完整模型百分比；配对次数与成功率合并展示，权重为两者之和。

四类边后卫的防守对抗均展示为单项“防守对抗有效性（修正）”：防守型14%、进攻型9%、均衡型10%、边翼卫7%。原次数/成功率权重只用于来源审计，不是两个独立奖励。该新增配对仅作用于四类边后卫能力分；行为支柱仍只描述参与，不读取成功率。对抗、空中对抗、盘带、传中等原有修正及逐指标尖点继续生效。

#### 防守型边后卫

- 身体对抗 25%：Duels per 90 6%；Duels won, % 7%；Aerial duels per 90 5%；Aerial duels won, % 5%；Fouls suffered per 90 2%。
- 边路防守 35%：Successful defensive actions per 90 9%；Defensive duels per 90 7%；Defensive duels won, % 7%；PAdj Interceptions 7%；PAdj Sliding tackles 3%；Shots blocked per 90 2%。
- 回追覆盖 18%：Total Distance per 90 7%；High Intensity Distance per 90 5%；Max Speed (km/h) 3%；Accelerations per 90 3%。
- 稳健出球 14%：Accurate passes, % 4%；Forward passes per 90 3%；Accurate long passes, % 2%；Losses per 90 5%（越少越好）。
- 防守纪律 8%：Fouls per 90 4%；Yellow cards per 90 3%；Red cards per 90 1%。

球权丢失优先真实Losses per 90及别名；缺列时按Passes per 90×(100−Accurate passes, %)÷100估算传球失误/90，使用普通反向算法并明确提示不含盘带、接球等失误。已存在真实列但某球员空值时不擅自补估算，按缺失处理。维度仍保持25/35/18/14/8。

#### 进攻型边后卫

- 身体对抗 13%：Duels per 90 3%；Duels won, % 4%；Aerial duels per 90 2%；Aerial duels won, % 2%；Fouls suffered per 90 2%。
- 边路输出 27%：Crosses per 90 6%；Accurate crosses, % 5%；Crosses to goalie box per 90 3%；xA per 90 3%；Shot assists per 90 2%；Passes to penalty area per 90 2%；Non-penalty goals per 90 3%；射门转化有效性（修正）3%（Shots per 90 2%＋Goal conversion, % 1%来源合并）。
- 突破推进 24%：Progressive runs per 90 6%；Dribbles per 90 5%；Successful dribbles, % 5%；Progressive passes per 90 4%；Accelerations per 90 4%。
- 纵向往返 18%：Total Distance per 90 6%；High Intensity Distance per 90 5%；Sprinting Distance per 90 (+25 km/h) 4%；Max Speed (km/h) 3%。
- 边路防守 18%：Successful defensive actions per 90 6%；Defensive duels per 90 4%；Defensive duels won, % 5%；PAdj Interceptions 3%。

#### 攻守均衡型边后卫（沿用旧技术ID inverted_fullback）

- 身体对抗 20%：Duels per 90 5%；Duels won, % 6%；Aerial duels per 90 3%；Aerial duels won, % 3%；Fouls suffered per 90 3%。
- 接应与传球推进 20%：Accurate passes, % 4%；Long passes per 90 3%；Accurate long passes, % 3%；Progressive passes per 90 4%；向前传球占总传球比例3%；Passes to final third per 90 3%。
- 进攻推进与边路输出 25%：Crosses per 90 3%；Accurate crosses, % 3%；Crosses to goalie box per 90 4%；Progressive runs per 90 3%；Dribbles per 90 3%；Successful dribbles, % 3%；Non-penalty goals per 90 3%；射门转化有效性（修正）3%（Shots per 90 2%＋Goal conversion, % 1%来源合并）。
- 边路防守 25%：Successful defensive actions per 90 8%；Defensive duels per 90 5%；Defensive duels won, % 5%；PAdj Interceptions 5%；PAdj Sliding tackles 2%。
- 跑动覆盖 10%：Total Distance per 90 5%；High Intensity Distance per 90 4%；Max Speed (km/h) 1%。

## 中卫

明确独立位置标记：CB、RCB、LCB。

| 支柱 | 指标内部权重 |
| --- | --- |
| 主动争抢 | 每90分钟防守对抗 55%；PAdj 滑铲 25%；每90分钟成功防守动作 20% |
| 拦截保护 | PAdj 拦截 65%；每90分钟成功防守动作 35% |
| 禁区保护 | 每90分钟封堵射门 40%；每90分钟空中对抗 35%；PAdj 拦截 25% |
| 制空参与 | 每90分钟空中对抗 60%；空中对抗占全部对抗比例 40% |
| 回追覆盖 | 每90分钟冲刺距离 35%；每90分钟加速 25%；最高速度 25%；每90分钟总距离 15% |
| 接应出球 | 每90分钟传球 35%；每90分钟接球 30%；每90分钟长传 20%；长传占总传球比例 15% |
| 推进出线 | 推进传球30%；传入前场三区20%；向前传球10%；向前传球比例15%；推进跑动15%；盘带5%；进攻对抗5% |
| 位置兼容性说明（不计分） | CB居中兼容，LB＋LCB/RB＋RCB同侧边中卫兼容；只说明与筛选 |

| 职责 | 相似度公式 | 识别边界 |
| --- | --- | --- |
| 上抢型中卫 | 65%×√(主动争抢×拦截保护) + 20%×制空参与 + 15%×回追覆盖 | 必要核心为主动争抢与拦截保护；需要录像确认是否主动离开防线施压。 |
| 拖后型中卫 | 60%×√(拦截保护×禁区保护) + 25%×回追覆盖 + 15%×制空参与 | 必要核心为拦截保护与禁区保护；回追只作辅助，争抢少或速度快不直接判为拖后。 |
| 出球型中卫 | 70%×√(接应出球×推进出线) + 15%×回追覆盖 + 15%×拦截保护 | 原持球出线并入推进支柱，传球质量只由能力分评价。 |

### 五项能力维度与逐指标权重

以下是完整模型百分比；配对次数与成功率合并展示，权重为两者之和。

#### 上抢型中卫

- 身体对抗 30%：可靠度修正对抗成功率12%；可靠度修正空中对抗成功率16%；Fouls suffered per 90 2%。
- 主动防守 35%：Successful defensive actions per 90 6%；可靠度修正防守对抗成功率18%；PAdj Interceptions 4%；PAdj Sliding tackles 7%。
- 身后恢复 15%：Sprinting Distance per 90 (+25 km/h) 5%；Max Speed (km/h) 4%；Accelerations per 90 3%；Total Distance per 90 3%。
- 基础出球 12%：Accurate passes, % 3%；Forward passes per 90 3%；Progressive passes per 90 3%；修正长传有效性3%（Long passes per 90 1%＋Accurate long passes, % 2%）。
- 防守纪律 8%：Fouls per 90 4%；Yellow cards per 90 3%；Red cards per 90 1%。

#### 出球型中卫

- 身体对抗 25%：可靠度修正对抗成功率10%；可靠度修正空中对抗成功率13%；Fouls suffered per 90 2%。
- 后场调度 30%：Accurate passes, % 8%；Accurate short / medium passes, % 6%；修正长传有效性16%（Long passes per 90 8%＋Accurate long passes, % 8%）。不再读取传球数、接球数。
- 穿线推进 25%：Progressive passes per 90 9%；Forward passes per 90 4%；Accurate forward passes, % 4%；向前传球占总传球比例（%） 3%；Passes to final third per 90 3%；Progressive runs per 90 2%。不再读取盘带有效性。
- 防守保护 15%：Successful defensive actions per 90 3%；可靠度修正防守对抗成功率8%；PAdj Interceptions 3%；Shots blocked per 90 1%。
- 身后恢复 5%：Max Speed (km/h) 2%；Sprinting Distance per 90 (+25 km/h) 2%；Total Distance per 90 1%。

#### 拖后型中卫

- 身体对抗 35%：可靠度修正对抗成功率13%；可靠度修正空中对抗成功率20%；Fouls suffered per 90 2%。
- 防线保护 30%：Successful defensive actions per 90 5%；PAdj Interceptions 7%；Shots blocked per 90 3%；可靠度修正防守对抗成功率15%。
- 回追覆盖 15%：Max Speed (km/h) 5%；Sprinting Distance per 90 (+25 km/h) 4%；Accelerations per 90 3%；Total Distance per 90 3%。
- 安全出球 12%：Accurate passes, % 4%；Forward passes per 90 2%；Progressive passes per 90 2%；修正长传有效性4%（Long passes per 90 2%＋Accurate long passes, % 2%）。
- 防守纪律 8%：Fouls per 90 4%；Yellow cards per 90 3%；Red cards per 90 1%。

三套能力模型合计均为100%，当前版本为v5-rate-reliability。三类对抗均仅以20次先验收缩后的成功率在中卫池的普通平滑百分位计分，次数不直接加分；总对抗与防守对抗按用户要求分别保留，不作重叠扣减。次数/90乘分钟/90估算尝试，成功次数由尝试乘原成功率估算；先验均值使用同位置、有效正尝试样本的尝试加权平均成功率。零尝试、缺任一来源、成功率越界或有效样本不足8时按缺失中性50计分并提示，不回退原始成功率。长传仍使用20次先验及35%/45%/20%有效性合成，当前适用于上述三类中卫及两类公开门将（门将新增范围不改变中卫计算）。尖点在每个修正成功率指标内只计一次。三项职责相似度、行为支柱、位置兼容性不变。详见CENTRE_BACK_CAPABILITY_V5.md；v4审计仅保留历史记录。

## 实现与验证

### 新增位置能力模型

#### 边翼卫

- 身体对抗15%：对抗3%、对抗成功率4%、空中对抗2%、空中对抗成功率2%、被犯规4%。
- 边路输出25%：传中6%、传中成功率6%、传入小禁区传中5%、xA 4%、助攻射门传球4%。
- 突破推进20%：推进跑动6%、盘带4%、盘带成功率4%、推进传球3%、加速3%。
- 纵向往返25%：总距离8%、高强度距离7%、冲刺距离6%、最高速度4%。
- 边路防守15%：成功防守动作5%、防守对抗4%、防守对抗成功率3%、PAdj拦截3%。

#### 边中卫（历史隐藏能力配置，不再作为职责分类）

- 身体对抗25%：对抗5%、对抗成功率7%、空中对抗5%、空中对抗成功率6%、被犯规2%。
- 防守保护25%：成功防守动作6%、防守对抗6%、防守对抗成功率5%、PAdj拦截5%、封堵射门3%。
- 侧翼回追20%：冲刺距离6%、最高速度5%、加速4%、总距离5%。
- 出球推进20%：传球成功率4%、推进传球5%、向前传球比例3%、传入前场三区3%、长传2%、长传成功率3%。
- 持球出线10%：推进跑动4%、盘带3%、盘带成功率3%。

上述事件与距离均为每90分钟，速度为最高速度，比例保留源字段或已记录派生公式。对抗、空中对抗、盘带和传中配对仍按全局修正有效性计一次；尖点逐指标应用。权重属于Research初始设计，未经过标注样本校准。

- 计算及公开说明同源：player-web/server/server_core/services/defender_role_analysis.py。
- 能力权重：scouting_role_catalog.py；评分接入：scouting_model.py。
- 页面：DefenderArchetypeMethod.tsx、ForwardArchetypeMethodPage.tsx、ScoutSearchPage.tsx。
- 八个后卫能力入口、每族四类职责匹配及侧别筛选；八套能力指标及权重、数据导入、贡献闭环、20人分页及其他位置模型不变。value字段仍表示百分位，兼容性规则分不是百分位。两项新职责roleFitScore开始输出结构合格的匹配分，旧资格侧字段停止输出。
- Research限制：权重未经过标注球员统计校准；拖后、上抢缺少空间证据，攻守均衡只描述参与而非质量，球队环境和多位置整季汇总可能影响判断。应通过熟悉的15–20名球员录像/活动图验证。

可复现命令：

```bash
cd /Users/yangchangran/xiangmu
python3 scripts/audit_architecture.py
MPLBACKEND=Agg python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title "Smoke Test" --subtitle "Template Validation"
(cd player-web/server && python3 -m unittest discover -s tests -p 'test_*scouting*.py')
(cd player-web/server && python3 -m unittest discover -s tests -p 'test_defender_role_analysis.py')
(cd player-web && npm run build)
curl -s http://127.0.0.1:8787/api/health
```

2026-10-07验证：`cd player-web/server && python3 -m unittest discover -s tests`全部68项通过；`npm run build`、架构审计、模板出图、`git diff --check`通过。后端已重启，`curl -s --fail http://127.0.0.1:8787/api/health`返回ok:true。Vite仍有超过500kB的既有体积提示；Matplotlib因默认缓存目录权限使用临时缓存，出图成功。

2026-10-08前次验证：后端全部71项测试通过，新增防守核心/跑动不干扰、40%权重与兼容性50%、四类合成行为样例测试。合成样例只证明规则运行一致，不证明真实分类准确率。架构审计、模板出图、前端构建、git diff --check通过；后端已重启，健康检查ok:true。实际完整.xlsx榜单82名边后卫，位置列显示RB, RWB等原表缩写。没有修改原始字段、百分位value语义、中卫公式或能力权重；未推送或部署。

方案二本轮验证：后端全部75项测试通过，增加连续主导曲线、缺失与零值区别、方向支持与左右对称、位置顺序不改变支持分、50分代理可参与识别以及能力分/可信度不变测试。架构审计、模板出图、前端构建、git diff --check通过；后端已重启，健康检查ok:true。完整.xlsx实际82名边后卫仍正常入榜；例如Manafá防守型相似度从前轮46.9降到11.7，能力分65.9不变，说明进攻主导不再被高防守参与遮蔽；这不是人工分类准确率验证。算法库显示位置支持90/100/65/50/20规则及连续曲线，详情显示防守主导差和位置行为支持程度。保留既有构建超过500kB与Matplotlib临时缓存提示。未进行录像标注校准或远端验证，因本轮不包含人工标注和部署，不承诺防守型总人数一定下降。

本轮修改文件：README.md、USAGE.md、本文件、defender_role_analysis.py、test_defender_role_analysis.py、DefenderArchetypeMethod.tsx、ScoutSearchPage.tsx。行为不变性：导航入口、Excel导入与持久化、其他位置核心页面、完整位置族统计基准、能力权重、20人分页、隐藏及侧别筛选不变。没有文件移动或结构重排；本轮有明确口径变化：翼卫方向支持规则与两项连续调节，调整原因新增展示。value仍为百分位；兼容性接口键沿用，但边后卫的规则分语义改为翼卫方向支持。未运行录像标注校准与远端部署验证，因本轮不包含人工标注或部署。

实际页面核对：完整.xlsx的边翼卫能力候选82人、中卫及边中卫能力候选79人；边中卫可按对应第四职责相似度排序，结构不足显示空值，详情显示四张职责卡与第八项绝对兼容分。算法库四行公式、支柱列表、保护条件与计算同源，浅色卡片延续现有样式。未进行熟悉球员录像标注验证、没有验证混合供应商位置编码，无法宣称分类准确率已达生产要求。权重与结构/行为门槛仍需人工校准，未推送Git或部署远端。

### 进攻方式说明交付审计（2026-10-08）

本次修改7个文件：USAGE.md、本文件、defender_role_analysis.py、test_defender_role_analysis.py、DefenderArchetypeMethod.tsx、ScoutSearchPage.tsx、scout-search.css。仅增加可选archetype.attackStyle和方法页attackStyleRules；scores表示解释路径的0–100分、不是群体百分位或能力分，已有字段语义不变。标签的10分差、50分路径门槛、50%单支柱覆盖属于新增显示默认规则，不改既有职责分类。

验证：后端79项测试（包括不重复计分逐值比较、两路径权重、10分边界、缺失/覆盖不足/无实质行动、样本不足及中卫隔离）、前端构建、架构审计、模板出图、git diff --check通过。后端已重启，健康检查ok:true。Vite既有超过500kB提示与Matplotlib临时缓存提示不影响本次验证。

实际页面：完整.xlsx仍82人，排名浅色说明正常；李磊详情显示“偏组织推进”，边路62.3、组织81.8、差19.5；刘洋两路径接近未强行显示。算法库显示相同公式与门槛。

行为不变性清单：导航入口与核心页面不变；导入/对应表/持久化不变；能力分、四职责相似度、原标签、可信度和排序逐值不变；百分位比较池、原始输入、20人分页与左右筛选不变。未改分类算法、更名内收型、推送Git或部署远端；未运行远端验证和人工录像校准，因为本轮只有本地说明标签。

完整复现：`cd /Users/yangchangran/xiangmu/player-web/server && python3 -m unittest discover -s tests`；其他构建/审计/出图命令见上方可复现命令。

参考文件：AGENTS.md第0、1、6、7、8节，README.md文档地图与Web功能说明，USAGE.md第4.15、9节，contributing_ai.md任务模板与交付协议。本轮修改：本文件、README.md、USAGE.md、defender_role_analysis.py、scouting_role_catalog.py、scouting_model.py、test_defender_role_analysis.py、DefenderArchetypeMethod.tsx、ScoutSearchPage.tsx。保留此前其他未提交修改，不重置用户工作。

### 攻守均衡替换交付审计（2026-10-08）

本次修改9个文件：本文件、README.md、USAGE.md、defender_role_analysis.py、scouting_role_catalog.py、test_defender_role_analysis.py、test_scouting_model.py、DefenderArchetypeMethod.tsx、ScoutSearchPage.tsx。名称、第三类相似度和能力权重正式替换；旧inverted_fullback技术ID沿用只是为了保存选择兼容，公开语义已改变，不与旧内收结果直接比较。value、原始Excel、存储键及API路径不变。攻守参与是行为，成功率与尖点仍只由能力分评价。

已运行：后端完整82项测试通过（两端低/单端高/差距门槛/缺失核心/组织辅助/零值并列保护/目录及既有标签测试）；npm run build、架构审计、模板雷达冒烟、git diff --check通过；后端已重启，curl健康检查ok:true。命令见上方可复现命令及完整测试命令。构建仍有既有500kB体积提示，Matplotlib使用临时缓存后出图成功。

实际完整.xlsx仍82名边后卫入榜，菜单、职责卡、方法页均显示攻守均衡型。高嘉润的主职责为攻守均衡型，保留“偏组织推进”说明；杨希攻守参与差22.3分，均衡诊断分44.5不竞争标签。这只是规则与页面核对，不是人工战术准确率证明。

不变性：页面入口、八支柱字段及百分位基准、左右筛选、20人分页、隐藏/恢复、其他三个边后卫能力及相似度公式、中卫及其他位置模型、量效耦合与尖点、数据可信度算法不变；相关主标签和第三职责能力排名因新公式会变化。本轮不是纯布局重构，没有移动文件。未推送Git或部署远端；未运行录像标注校准或远端验证，因为没有相应任务授权或标注样本，仍为Research。

参考：AGENTS.md第0/1/6/7/8节；README.md当前能力与文档地图；USAGE.md第4.15/9节；contributing_ai.md任务模板、文档同步和交付协议。

### 四类边后卫能力细化交付审计（2026-10-08）

修改文件：本文件、README.md、USAGE.md；server_core/services下scouting_role_catalog.py（四套五维配置与版本）、forward_role_analysis.py（有职责范围限制的防守对抗配对，沿用既有计算）、scouting_model.py（目录与运行时同源应用）；tests/test_defender_role_analysis.py（5项回归）；src/pages/scout-search下ForwardArchetypeMethodPage.tsx（正确显示缺列球权丢失估算公式）、ScoutSearchPage.tsx（修正配对说明文案）。共9个文件，保留此前未提交工作。未移动文件或大幅重构。

能力口径明确改变：防守对抗新增量效配对仅限四类边后卫；指定删项、配平及丢失球权反向5%见上方逐指标配置。四套能力分及其排名会变化；原始Excel、value百分位字段、API路径、持久化键不变。真实Losses列优先，只有整列缺失才估算传球失误，不能当作完整球权丢失。算法库已修正此类派生公式的显示，不再误写成两来源相减。

已运行并通过：`cd /Users/yangchangran/xiangmu/player-web/server && python3 -m unittest discover -s tests`（87项）；`cd /Users/yangchangran/xiangmu/player-web && npm run build`；`python3 scripts/audit_architecture.py`；`MPLBACKEND=Agg python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title 'Smoke Test' --subtitle 'Template Validation'`；`git diff --check`。后端重启后`curl -s --fail http://127.0.0.1:8787/api/health`返回ok:true。Vite仍有既有500kB体积提示；Matplotlib使用临时缓存后出图成功。

本地实际完整.xlsx核对：四类能力榜均82名候选；防守型修正防守对抗14%、球权丢失5%及缺列估算说明；进攻型五维13/27/24/18/18、被犯规2%、修正防守对抗9%；均衡型移除深度传中与冲刺距离；翼卫移除深度传中，修正防守对抗7%。算法库显示单项修正及来源权重，球权丢失方向越低越好、估算公式明确。分类与能力继续分开。

不变性清单：导航及核心页面结构、导入/对应表/存储、八支柱及相似度公式、标签竞争、侧别与完整位置族比较池、20人分页/隐藏、其他位置能力配置不变。测试确认改防守对抗成功率不改archetype，低数量高成功率被收缩，缺成功率不伪造成功次数，贡献闭环成立。尖点仍逐指标且配对计一次，分钟收缩不变。未运行人工录像校准或服务器部署/远端验证，本轮无标注样本及部署请求；仍为Research，未推送Git。

参考：AGENTS.md第0、1、6、7、8节；README.md第3、5、6节；USAGE.md第4.15、9节；contributing_ai.md任务模板、文档同步与交付协议。
