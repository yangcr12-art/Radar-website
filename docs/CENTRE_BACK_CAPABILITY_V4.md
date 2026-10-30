# 中卫职责能力 v4 审计（Research）

历史记录：对抗部分及其权重已由v5-rate-reliability替代；现行规则见CENTRE_BACK_CAPABILITY_V5.md。长传有效性保留。

## Goal / DoD / Scope

落实三类中卫能力权重调整，防止少量尝试的高成功率直接获得过高评分。三套能力权重各100%，目录、详情和计算共用配对配置；不调整职责相似度、行为支柱、位置兼容性、其他职责权重或输入数据。

## Implementation Notes

- 上抢型：维度30/35/15/12/8。主动防守为成功防守动作9%、修正防守对抗有效性13%（次数7、成功率6）、PAdj拦截6%、PAdj滑铲7%。基础出球长传有效性3%（次数1、成功率2）。
- 出球型：维度25/30/25/15/5。后场调度为传球成功率8%、短中传成功率6%、修正长传有效性16%（次数8、成功率8）；移除传球数和接球数。穿线推进移除盘带有效性，释放的2%补给推进传球，后者为9%。
- 拖后型：维度35/30/15/12/8。身体对抗来源权重为对抗7%、成功率9%、空中对抗8%、空中成功率9%、被犯规2%；回追覆盖为最高速度5%、冲刺距离4%、加速3%、总距离3%；长传有效性4%（次数2、成功率2）。
- 未指定的来源权重保留。完整列表见DEFENDER_ROLE_MODELS.md。
- 长传配对仅启用于上述三个公开中卫职责。防守对抗配对在已有四类边后卫之外仅新增上抢型中卫；不擅自改变其余职责。
- 沿用20次先验收缩：调整成功率=(估算成功次数+20×同位置尝试次数加权平均成功率)/(估算尝试次数+20)。估算尝试次数=每90分钟数量×出场分钟/90；复合百分位=次数百分位35%+调整成功次数/90百分位45%+调整成功率百分位20%。
- 配对来源只计为一个指标，其权重为来源权重之和，尖点只触发一次，贡献仍闭环到最终分。字段value仍表示百分位。
- 缺少整列时沿用普通单项回退；配对成立但个别球员缺成功率时，不伪造成功率，采用既有缺失中性回退。有效配对样本不足8时不强行生成复合评分。

## Files

- server_core/services/scouting_role_catalog.py：三套权重及版本。
- server_core/services/forward_role_analysis.py：职责限定的防守对抗及长传配对。
- server/tests/test_defender_role_analysis.py：权重、目录、配对范围、低次数高成功率、缺值与贡献闭环、相似度不变回归。
- src/pages/scout-search/ScoutSearchPage.tsx：量效耦合说明。
- README.md、USAGE.md、DEFENDER_ROLE_MODELS.md及本文：行为与审计文档。

以上服务、测试及页面路径均相对于player-web。仓库原有未提交改动保留，未提交或推送Git，未更新远端服务器。

## Commands / Tests

在仓库根目录运行：

```bash
python3 scripts/audit_architecture.py
MPLBACKEND=Agg python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title 'Smoke Test' --subtitle 'Template Validation'
(cd player-web && npm run build)
(cd player-web/server && python3 -m unittest discover -s tests)
git diff --check
curl -s --fail http://127.0.0.1:8787/api/health
curl -s --fail -o /dev/null -w 'Frontend HTTP %{http_code}\n' http://127.0.0.1:5173/
```

2026-10-08：全部通过，后端93项测试通过，雷达烟测出图成功。已重启本地后端，健康检查ok=true，前端HTTP 200。构建有单包超过500kB提示，未阻塞构建；Matplotlib默认缓存不可写时使用临时缓存，不影响出图。未进行浏览器交互或人工球员校准；当前无法复现先前页面打不开，HTTP成功不等于所有交互已验证。

## Risks / 行为不变性

- Research权重尚未以人工标注球员样本校准；实际尝试次数由分钟与每90分钟量估算。
- 能力分及排名预期改变；三项相似度、标签规则、侧别兼容、筛选统计基准、数据导入、20人分页、原始字段及存储语义不变。
- 入口与核心页面保留，算法库仍读取后端实际目录，未新增独立算法副本。

## References

AGENTS.md §0、§1、§6–8；README.md项目文档地图与球探搜索说明；USAGE.md §4.15及§9；contributing_ai.md任务与交付协议；docs/DEFENDER_ROLE_MODELS.md中卫能力列表。
