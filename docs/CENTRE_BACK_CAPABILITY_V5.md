# 中卫能力v5：可靠度修正成功率（Research）

## Goal / Definition of Done

三类公开中卫的总对抗、空中对抗、防守对抗以成功率评价能力，次数只作为可靠度证据。按用户明确要求，总对抗与防守对抗分别保留权重，不作重叠扣减。目录、实际评分、详情与说明同源；三套各100%，测试与健康检查通过。

## Scope / Implementation Notes

- 仅上抢、出球、拖后三类中卫，不修改隐藏历史边中卫或其他位置。
- 三组来源分别为Duels per 90 / Duels won, %，Aerial duels per 90 / Aerial duels won, %，Defensive duels per 90 / Defensive duels won, %。
- 估算尝试n=每90分钟次数×出场分钟/90。成功率p换算至0–1。先验平均μ=Σ(n×p)/Σn，使用本次完整中卫比较池中的有效正尝试观察。
- 修正成功率=(n×p+20×μ)/(n+20)。仅将其在有效中卫样本中的普通平滑百分位用于能力计分。不再加入次数百分位、成功次数百分位，不按来源权重二次合成。
- 次数不再是这三个指标的独立能力条目，只作为修正依赖；原始数据不删改。成功率行显示原成功率，悬停可追溯次数/90、估算尝试及修正成功率。API的coupledComponents新增mode、volumePer90、attempts、observedRate解释字段，旧字段仍保留；本模式score=rateScore。
- 零尝试、负次数、缺任一来源、原成功率不在0–100内、有效正尝试样本不足8时，该能力条目不可用、中性50，不回退未经修正的成功率。全部同修正值时依现有百分位规则为50。
- 逐指标尖点仍按修正成功率排名计算一次；分钟可靠度及贡献闭环不变。长传有效性继续使用既有35%/45%/20%合成。

## 权重

| 职责 | 身体对抗 | 防守维度 |
| --- | --- | --- |
| 上抢 | 总对抗成功率12%、空中成功率16%、被犯规2%，合计30% | 防守对抗成功率18%、成功防守动作6%、PAdj拦截4%、PAdj滑铲7%，合计35% |
| 出球 | 总对抗成功率10%、空中成功率13%、被犯规2%，合计25% | 防守对抗成功率8%、成功防守动作3%、PAdj拦截3%、封堵射门1%，合计15% |
| 拖后 | 总对抗成功率13%、空中成功率20%、被犯规2%，合计35% | 防守对抗成功率15%、成功防守动作5%、PAdj拦截7%、封堵射门3%，合计30% |

表内三种成功率均为可靠度修正后百分位。其他维度和逐项权重保留v4；完整现行列表见DEFENDER_ROLE_MODELS.md。

## Files

- player-web/server/server_core/services/forward_role_analysis.py：职责限定rate_only模式、有效观察和解释字段。
- player-web/server/server_core/services/scouting_model.py：目录及实际评分接入，仅将成功率列映射至该组。
- player-web/server/server_core/services/scouting_role_catalog.py：三套权重、v5版本与来源说明。
- player-web/server/tests/test_defender_role_analysis.py：更新当前权重断言，新增九种职责/对抗组合的数学、缺失及分类不变验证。
- player-web/src/pages/scout-search/ScoutSearchPage.tsx：当前算法说明与来源悬停信息。
- README.md、USAGE.md、docs/DEFENDER_ROLE_MODELS.md、docs/CENTRE_BACK_CAPABILITY_V4.md、本文：现行口径及历史审计同步。

## Commands / Tests

仓库根目录复现：

```bash
python3 scripts/audit_architecture.py
MPLBACKEND=Agg python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title 'Smoke Test' --subtitle 'Template Validation'
(cd player-web && npm run build)
(cd player-web/server && python3 -m unittest discover -s tests)
git diff --check
curl -s --fail http://127.0.0.1:8787/api/health
```

2026-10-08结果：架构审计、烟测出图、前端构建、94项后端测试通过。已重启本地后端，健康返回ok=true。构建仍提示单包超过500kB；Matplotlib默认缓存不可写时自动使用临时缓存，出图成功。未进行浏览器视觉/交互验收或人工球员标注校准，未推送Git或部署服务器。

## Risks / 行为不变性清单

- 能力评分口径与排名有意改变，仍为Research；20次先验未以标注样本调参，估算尝试受源表四舍五入影响。
- 按用户要求不去重，总对抗与防守对抗可能有统计重叠，此风险保留。
- 导航与核心页面入口、三项职责相似度、七行为支柱、位置兼容性、筛选统计基准、原始数据、value百分位语义、导入存储、20人分页、其他位置能力及长传合成不变。未进行文件移动或架构重排。

## References

### 后续展示修正：原值双来源

Goal/DoD：原值直接显示对抗次数/90及成功率，不需悬停；真实零与缺失区分。Scope仅展示与只读来源元数据，不改变算法。

Implementation：scouting_model.py增加rawSources，直接读取当前球员的已解析原始次数与原始成功率，即使零尝试、不足样本或修正评分不可用仍返回已知原值；未知为null。ScoutSearchPage.tsx分行显示“次数/90”和“成功率”，百分比带%。单来源合并行使用其原始成员值，不再将合并行null误显示成0。test_defender_role_analysis.py验证九种组合的原值、真实0及缺失来源。USAGE.md §4.15与§9同步；本段为补充审计。

Commands/Tests：上方全部复现命令重新执行，94项测试、构建、架构审计、雷达烟测及diff检查通过。后端重启后健康检查ok=true。未进行浏览器视觉验收；构建大小与临时缓存提示同上。文件仅上述三项代码/测试、USAGE.md及本文；不改权重、统计基准、相似度、存储、原始输入、导航、页面入口或分页，不重排架构。显示回退变化仅为空值从误报0改为“—”。

I have read: AGENTS.md（§0、§1、§6–8）、README.md（§3）、USAGE.md（§4.15、§9）、contributing_ai.md（任务模板、验证与交付）。
