# 中卫职责与位置兼容性（2026-10-08）

## Goal / DoD / Scope

CB确认居中兼容，边中卫改为说明与筛选；只保留上抢、拖后、出球三项独立职责相似度。三项能力与相似度公式不变，位置证据不进入分数及覆盖率。同步算法库、排名、详情和文档；保留用户已有修改，不推送或部署。

## Implementation Notes

- 按用户确认的本项目源表编码，CB确认居中，不依赖比较池中是否出现LCB/RCB。不能据此推断一直居中、五后卫阵型或拖后职责。
- LB＋LCB、RB＋RCB分别确认左、右边中卫兼容；都有则双侧。CB＋边后卫但无对应LCB/RCB为待确认；跨侧及RWB＋RCB不替代同侧配对。
- `archetype.positionCompatibility`包含center、wideSides、pendingWide、labels；中卫第八卡片score及compatibilityEvidence.score改为null。数值不再表示公开兼容性规则分，原始value百分位字段不变。
- 中卫仅七个行为支柱计入覆盖率。主标签及区分度因移除第四竞争项可能变化；不是重新设定三职责权重。
- 公共模型28→27。历史wide_centre_back能力配置与API保留但隐藏，不输出第四相似度，避免破坏旧入口。
- 兼容性筛选与侧别筛选取交集，发生在排序后的显示层，保留完整比较池、原分数和整体名次。

## Files / References

参考AGENTS.md第0–8节（口径、前置阅读、验证与审计）、README.md功能地图、USAGE.md第4.15与第9节、contributing_ai.md任务交付协议。

修改：server_core/services/defender_role_analysis.py、scouting_role_catalog.py；tests/test_defender_role_analysis.py、test_scouting_model.py；src/pages/scout-search/ScoutSearchPage.tsx、DefenderArchetypeMethod.tsx（均位于player-web）；README.md、USAGE.md、docs/DEFENDER_ROLE_MODELS.md及本文。

## Commands / Tests

```bash
cd /Users/yangchangran/xiangmu
python3 scripts/audit_architecture.py
MPLBACKEND=Agg python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title 'Smoke Test' --subtitle 'Template Validation'
cd player-web
npm run build
cd server
python3 -m unittest discover -s tests
curl -s --fail http://127.0.0.1:8787/api/health
```

验证结果：后端91项测试通过，Web构建、架构审计、模板雷达出图及git diff --check通过；后端已重启，健康检查返回ok:true。构建仍有现有500kB包体积提醒；Matplotlib使用临时字体缓存，不影响出图。新增测试覆盖三项竞争、旧入口隐藏兼容、CB居中、同侧/跨侧边界、非计分卡片、兼容性不改变相似度/能力/可信度。

实际完整.xlsx页面验证：中卫完整候选79人；居中17人，兼容左侧边中卫7人、右侧9人。右侧兼容筛选后共9人，Wang Shenchao仍为整体第11、当前职责相似度52.5、能力68.1、最终65.5，与筛选前一致；位置列保留RCB, RB，兼容徽标与职责分别显示。截图工具已目视确认排名布局。未执行录像准确率校准、服务器部署或Git推送，因本次未提供标注或相应请求。

复检时曾从仓库根目录直接发现后端测试，因缺少server_core导入路径失败；按上方命令进入player-web/server重跑，91项全部通过。请使用文中工作目录复现。

## Risks / 不变性

Research：源表位置兼容不证明真实空间职责；未做录像标注准确率校准。没有修改输入数据、持久化、其他位置模型、三项中卫能力权重、量效耦合、尖点、分页/隐藏入口；筛选仅改变可见名单。没有远端部署或推送请求。
