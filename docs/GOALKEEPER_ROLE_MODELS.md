# 门将双职责模型（Research，2026-10-08）

## Goal / DoD / Scope

为扑救型门将、出球型门将补齐八行为支柱、独立相似度、四维能力权重、标签和可信度，接入搜索及算法库。目录、计算和页面同源；其他位置公式、原始数据、导入与持久化不变。不包括服务器部署、Git推送、空间数据采集及真实分类准确率认证。

参考：AGENTS.md §0–8、README.md功能地图、USAGE.md §4.15/§9、contributing_ai.md §0–5；战术职责参考[FIFA门将说明](https://www.fifatrainingcentre.com/en/resources-tools/football-language/goalkeeping/index.php)，以下权重是本项目先验，不是FIFA评分公式。

## Implementation Notes：行为识别

候选必须含独立GK位置标记。每字段仅与门将池比较，采用普通并列中位百分位，至少8个有效样本；不使用外场总行动分母。缺失不填零，按支柱可用特征权重重算，覆盖率保留。总传球须大于0，短中传、长传各自须非负且不大于总传球；对应来源错误则比例缺失，短中传越界同时屏蔽其数量特征。不使用总传球减长传代替短中传。

| 支柱 | 来源与内部权重 |
| --- | --- |
| 射门应对负荷 | Shots against per 90，100% |
| 禁区出击参与 | Exits per 90，100% |
| 高空球参与 | Aerial duels per 90，100% |
| 直接处理倾向 | Long passes per 90 / Passes per 90，100% |
| 短中传组织 | Short / medium passes per 90，60%；该值占总传球40% |
| 长传发起 | Long passes per 90，100% |
| 向前输送 | Forward passes per 90，50%；Progressive passes per 90，50% |
| 传接球参与 | Passes per 90，40%；Received passes per 90，60% |

两项各0–100，不是概率，不要求合计100。扑救型=75%×直接处理与相对守门倾向几何均值＋10%×高空参与＋10%×出击＋5%×射门应对；相对守门倾向=100减短中传组织与传接球参与均值。出球型=75%×短中传组织与传接球参与几何均值＋20%×向前输送＋5%×长传发起。内部以0–1计算，最后乘100。接回传专属字段完全退出行为识别，但四维能力配置中原有接回传指标保持不变。

至少4支柱、核心齐备、有实质行动且职责证据覆盖≥70%才准入。辅助项缺失按可用组合权重归一，核心不能替代。扑救型核心≥40且长传>0；出球型核心≥45且实际短中传/接球>0。短中传占比须有效，扑救型还要求接球原值存在；被射门缺失或为0不阻止准入。未准入在当前职责相似度显示“未达标”，缺核心来源显示“数据不足”；数据充分但强度不足或最高分<45显示特征不突出。默认一个主职责，双项≥70且差≤3或双项≥65且差≤2才复合。

数据可信度=八支柱可用权重平均覆盖×分钟可靠度×位置可靠度。GK第一/第二/第三及以后100/75/55%。区分度=两项有效相似度差÷20，上限100%，少于两项有效职责时为0。两者均不参与相似度或能力计分。

## 能力维度及原始指标权重

权重为整套模型百分比，每套合计100。次数/率同时存在时合并为一个修正有效性，保留来源原值；尖点奖励逐指标沿用现有引擎。

| 扑救型维度 | 权重 | 指标权重 |
| --- | --- | --- |
| 扑救表现 | 55 | 扑救率25，Prevented goals per 90 30 |
| 身体对抗与禁区处理 | 15 | 出击3，总对抗次数2/成功率3，空中对抗次数3/成功率4 |
| 基础传球 | 12 | 传球成功率7，短中传成功率5 |
| 长传发起 | 18 | 长传次数7/成功率11 |

| 出球型维度 | 权重 | 指标权重 |
| --- | --- | --- |
| 扑救保障 | 35 | 扑救率20，Prevented goals per 90 15 |
| 身体对抗与禁区处理 | 10 | 出击3，总对抗次数1/成功率1，空中对抗次数2/成功率3 |
| 后场接应与传球 | 25 | 门将接回传5，传球成功率12，短中传成功率8 |
| 向前输送与长传 | 30 | 推进传球7，向前传球5，长传次数8/成功率10 |

次数皆为每90分钟。当前v3两类门将均删除控球与纪律，不再读取球权丢失和犯规计分。长传沿用20次先验、35%数量/45%调整成功数量/20%调整成功率。移除直接丢球数、速度和冲刺能力权重；不影响外场球员。能力缺失中性50及分钟收缩不变，value仍表示百分位。

### v3权重调整审计

Goal/DoD：删除控球与纪律、落实扑救型30%预防失球和25%扑救率、出球型向前输送与长传30%，模型合计100%；算法库自动读取同一配置。Scope：仅两类公开门将能力分及权重测试、README/USAGE/本文。类型识别及其他职责不变，不新增结构重排。用户“控球与扑救”按现有“控球与纪律”理解，扑救表现维度保留。Files：scouting_role_catalog.py、test_goalkeeper_role_analysis.py及上述三份文档。验证命令沿用下节，风险仍为Research；能力排名可能变化，百分位字段语义不变。此前五维版本的验证为历史记录。

v3验证结果：99项测试、架构审计、前端构建、diff空白检查通过；后端重启并返回ok:true。模板原命令在本机图形后端退出134，改用无界面后端后成功：`MPLBACKEND=Agg MPLCONFIGDIR=/private/tmp/player-mpl-cache python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title 'Smoke Test' --subtitle 'Template Validation'`。前端构建保留原有500kB资源提示。此增量未重复浏览器测试（页面直接读取已测试目录配置），未推送或部署。

## Files

- 新增后端goalkeeper_role_analysis.py、测试test_goalkeeper_role_analysis.py、前端GoalkeeperArchetypeMethod.tsx。
- 接入scouting_model.py、scouting_role_catalog.py、forward_role_analysis.py、ForwardArchetypeMethodPage.tsx、ScoutSearchPage.tsx。
- 更新长传适用范围测试test_defender_role_analysis.py，以及README.md、USAGE.md、DEFENDER_ROLE_MODELS.md和本文。

## Commands / Tests

```bash
PYTHONPATH=player-web/server python3 -m unittest discover -s player-web/server/tests
python3 scripts/audit_architecture.py
python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title "Smoke Test" --subtitle "Template Validation"
cd player-web && npm run build
curl -s http://127.0.0.1:8787/api/health
git diff --check
```

测试在server目录运行时使用`python3 -m unittest discover -s tests`。全套99项通过，涵盖质量字段不影响类型、贡献闭环、合成行为对比、缺列、全零、无效比例、小样本及准确GK位置池。架构审计、模板出图、前端构建通过；构建仅有大于500kB资源提示。后端已重启，健康检查ok:true。浏览器核对算法库门将入口、八支柱、两公式及两套五维权重；完整.xlsx实际运行后门将比较基准26人，排名及球员详情输出两项独立相似度、可信度和原值来源。实际榜单能运行不代表已人工验证分类准确率。

## Risks / 行为不变性

这是Research代理：被射门强烈受球队环境影响，不能由高负荷认定扑救能力或低站位；出击次数不是成功率，短中传参与不是受压出球能力，长传占比也不等于解围。八支柱有相关性，不是统计独立维度。没有PSxG、站位、受压传球和球队环境校准；Prevented goals直接读取，不冒充PSxG。可信度高只表示数据充分，不表示已控制环境。应结合熟悉门将和录像复核，不把合成样例测试当真实准确率。

## 行为v2交付审计

Goal/DoD：纠正射门负荷主导扑救型、接回传近全零阻止出球型准入的问题；同步八支柱与两公式、类型与能力保持分离。Scope：仅goalkeeper_role_analysis.py、test_goalkeeper_role_analysis.py、GoalkeeperArchetypeMethod.tsx、README.md、USAGE.md及本文，不改scouting_role_catalog.py能力权重。规则见上方当前定义，历史v1公式不再使用；未新增跨联赛环境校准。

Implementation Notes：以用户熟悉球员作为弱验证锚点，不按姓名写死结果或固定类别人数；实际短中传与接球是组织证据，真实长传占比提供直接处理证据，低组织单项不够确认扑救型。数据充分但核心强度不足与字段缺失分开提示。数据可信度仍是平均覆盖率乘分钟/位置可靠度，其支柱来源已随v2更新。

实测完整.xlsx（比较池26人）：Li Hao扑救型80.30/出球型10.26（出球核心未达标）；Yao Haoyang扑救型49.46/出球型43.91（出球核心未达标），显示扑救型但状态leaning，不宣称确定结论。两名用户样本用于此次检查，不作为运行时判断分支；还需独立门将样本人工验证泛化。

Commands/Tests：下节所列后端测试现为101项，新增接回传缺列不改变类型、射门负荷变化不影响准入且全字段完整时影响不超过5分、缺乏真实直接行为不能确认扑救型；原有质量字段独立、缺列/零值/错误比例/小样本和四维能力权重测试继续通过。架构审计、Agg模板出图、前端构建与git diff --check通过，后端重启并健康检查ok:true。未重复浏览器交互验证；页面模板公式与后端目录同源，人工录像复核未完成。构建仍有原有大资源提示。

行为不变性：入口、原始数据、导入/存储、门将能力分及尖点、外场所有计算、value百分位语义保持不变。改变门将相似度/标签/支柱覆盖率；无结构重排，未推送或部署。

导航入口、数据导入及持久化、外场评分/相似度、百分位value语义、筛选与统计分离保持不变。公开模型仍27个；历史隐藏清道夫门将API未修改。未提交、推送或部署。
