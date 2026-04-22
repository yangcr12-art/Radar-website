# contributing_ai.md — AI 协作与交付协议

> 本文件定义 AI 在 `player` 项目中的执行协议。与其他文档冲突时，优先级遵循 `AGENTS.md`。

---

## 0) 强制阅读

每次任务开始前必须阅读：

- `README.md`
- `USAGE.md`
- `AGENTS.md`
- `contributing_ai.md`

交付中必须显式写：`I have read: ...`

---

## 1) 任务模板（必须）

```text
# 任务：<一句话>

Goal:
- ...

Definition of Done (DoD):
- [ ] ...

Scope:
- In scope: ...
- Out of scope: ...

Implementation Notes:
- 数据口径：...
- 默认值：...
- 回退策略：...

Files:
- path/to/file

Commands / Tests:
- python3 scripts/audit_architecture.py
- python3 scripts/generate_player_radar.py ...
- (if web changed) cd player-web && npm run build

Risks:
- ...
```

---

## 2) 执行原则

- 最小改动：优先局部修复，避免无关重构
- 口径优先：UI 优化不得改变统计语义
- 文档同步：默认值、语义、入口变化必须落文档
- 禁止伪造：未运行命令必须明示
- 前端统一：`player-web/src` 不新增 `.js/.jsx`

---

## 3) 文档同步触发条件

满足任一项必须同步 `USAGE.md`：

1. 默认值变化
2. 字段语义变化
3. 导航或入口变化
4. 回退策略变化
5. API 调用方式变化

涉及全局红线/审计策略时，需同步 `AGENTS.md`。

---

## 4) 最低验证

```bash
python3 scripts/audit_architecture.py

python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/ai_validation.png \
  --title "AI Validation" \
  --subtitle "player template"
```

若改 Web 前端：

```bash
cd player-web
npm run build
```

若改后端：

```bash
python3 player-web/server/app.py
curl -s http://127.0.0.1:8787/api/health
```

---

## 5) 交付格式（必须包含）

1. `I have read: ...`
2. 变更摘要
3. 文件清单
4. 验证命令与结果
5. 未完成项/风险项

若任务类型为“重构/优化（不新增功能）”，额外必须包含：

6. 行为不变性清单（逐页或逐功能对照）
7. 哪些结构被重排（文件移动/函数抽离/命名统一）
8. 明确声明“无口径变化”或列出变化点
9. 若拆分超大入口文件，说明新的职责落点（例如 `App.tsx -> app/components/hooks`，`server/app.py -> routes/services`）

---

## 6) 禁止事项

- 编造脚本参数或接口字段
- 修改语义但不更新文档
- 把示例数据硬编码到业务逻辑
- 用样式需求改动统计口径
- 在未确认前提下做破坏性重置

---

_最后更新：2026-04-22_
