# player — Agent Guide (AGENTS.md)

> 本文件是仓库协作的语义合同。AI 与人类改动代码前都必须遵守。

---

## 0) 强制前置阅读

开始任何改动前，必须阅读：

- `README.md`：项目定位与目录
- `USAGE.md`：可执行命令与参数
- `AGENTS.md`：红线与验收口径
- `contributing_ai.md`：AI任务书与交付格式

**DoD 强制项**：每次交付必须写明“参考了哪些章节/文件”。

---

## 1) 核心红线（触犯即不合格）

1. 输入口径一致（Single Source of Truth）
- 图表数据来源必须明确到输入 CSV。
- 不允许“脚本内硬编码数据”导致结果不可复现。

2. 不伪造统计值
- 不允许为了视觉效果擅自改写用户输入数值。
- 所有展示值必须可追溯到 CSV 字段。

3. 输出可复现
- 交付必须给出可直接运行的命令。
- 修改默认行为时，必须同步更新 `USAGE.md`。

4. 变更可审计
- 任何字段语义变化（例如 `value` 不再是百分位）必须在文档显式说明。

5. 后端改动必须重启服务
- 只要修改了 `player-web/server/app.py`（或后端依赖/配置），交付前必须重启后端服务。
- 重启后必须至少验证一次健康检查：`curl -s http://127.0.0.1:8787/api/health` 返回 `ok: true`。

---

## 2) 图表语义口径

- `value`：默认表示 percentile（0-100）
- `per90`：仅用于标注展示，不参与长度计算
- `group + order`：共同决定指标在圆周上的分区与排序
- `tier`：控制默认颜色层级，不改变数值

---

## 3) 模板字段规范

CSV 标准字段：

- 必填：`metric,value,group,order`
- 可选：`per90,tier,color`

约束：
- `value` 必须在 `[0,100]`
- `order` 必须是整数
- `metric/group` 不能为空

---

## 4) 实施边界

- 本项目当前聚焦“模板化出图”，不在本阶段扩展为完整数据抓取平台。
- 新功能优先级：
  1) 模板稳定性
  2) 批量导图
  3) 主题系统
  4) Web UI

---

## 5) 每次任务最低验证

至少运行：

```bash
python3 scripts/audit_architecture.py

python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/smoke_test.png \
  --title "Smoke Test" \
  --subtitle "Template Validation"
```

若失败，需在交付里说明失败原因与修复建议。

---

_最后更新：2026-03-01_
