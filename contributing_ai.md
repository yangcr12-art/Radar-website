# contributing_ai.md — AI 协作与交付协议

> 本文件定义 AI 在 `player` 项目中的工作方式。  
> 口径红线以 `AGENTS.md` 为准。

---

## 0) 开始前强制阅读

- `README.md`
- `USAGE.md`
- `AGENTS.md`
- `contributing_ai.md`

**硬性要求**：每次交付必须写 `I have read: ...`，并列出实际参考章节。

---

## 1) 任务书模板（必须）

```text
# 任务：<一句话>

Goal:
- ...

Definition of Done (DoD):
- [ ] ...
- [ ] ...

Scope:
- In scope: ...
- Out of scope: ...

Steps (minimal changes only):
1) ...
2) ...

Files:
- path/to/file

Commands / Tests:
- python3 scripts/audit_architecture.py
- python3 scripts/generate_player_radar.py ...
- (if web changed) cd player-web && npm run build

Decision Log:
- 默认值选择：...
- 口径选择：...
- 回退策略：...

Risk Notes:
- 字段语义是否变化？
- 文档是否同步？
- 是否有行为回归风险？
```

---

## 2) 代码与文档交付原则

- 最小改动：一次只处理一个清晰目标。
- 文档同步：命令、默认值、口径变化必须同步更新 `USAGE.md`。
- 不提交产物：`out/` 下导出图不纳入仓库。
- 不伪造验证：未运行命令必须明确说明。
- 后端改动（`player-web/server/app.py` 或后端依赖）必须重启并验健康检查。

---

## 3) 禁止事项（高频错误）

- 写出脚本不支持的参数。
- 修改字段语义但不更新文档。
- 把示例数据硬编码进逻辑层。
- 口径变化只在聊天说明，不落文档。
- UI 表现需求导致数据统计口径被修改。

---

## 4) 文档同步触发条件

满足任一条件，必须同步文档：

1. 默认值变化（如开关默认状态、样式默认值）
2. 字段语义变化
3. 页面导航/功能入口变化
4. 口径变化（统计基准、筛选规则、回退策略）

最少要更新：`USAGE.md`；必要时同步 `README.md` 和 `docs/*`。

---

## 5) 每次任务最低验证

```bash
python3 scripts/audit_architecture.py

python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/ai_validation.png \
  --title "AI Validation" \
  --subtitle "player template"
```

若改了 Web 前端：

```bash
cd player-web
npm run build
```

若改了后端：

```bash
python3 player-web/server/app.py
curl -s http://127.0.0.1:8787/api/health
```

---

## 6) 交付输出格式（必须包含）

1. `I have read: ...`
2. 变更摘要（做了什么、为什么）
3. 文件清单（绝对路径或仓库相对路径）
4. 验证命令与结果
5. 未完成项/风险项（如有）

---

## 7) 经验教训沉淀要求

每次功能迭代后，至少回答：

- 这次新增了什么规则？
- 哪个默认值最容易引发误解？
- 哪条回退策略需要显式写进文档？
- 未来同类需求应优先改哪层（规则/状态/展示）？

---

_最后更新：2026-03-03_
