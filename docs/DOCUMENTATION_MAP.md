# Documentation Map

`player` 仓库文档导航与维护索引。

## 1) 阅读优先级（高 -> 低）

1. `AGENTS.md`
2. `USAGE.md`
3. `README.md`
4. `docs/*` 与 `player-web/README.md`

## 2) 按角色阅读路径

### 产品/运营
1. `README.md`
2. `USAGE.md`
3. `docs/ROADMAP.md`

### 前端开发
1. `AGENTS.md`
2. `USAGE.md`
3. `docs/ARCHITECTURE_RULES.md`
4. `player-web/README.md`

### 后端开发
1. `AGENTS.md`
2. `USAGE.md`
3. `docs/ARCHITECTURE_RULES.md`

### AI 协作/自动化任务
1. `AGENTS.md`
2. `USAGE.md`
3. `contributing_ai.md`
4. `docs/DOCUMENTATION_MAP.md`

## 3) 文档职责边界

- `README.md`：项目入口、快速闭环、结构总览
- `USAGE.md`：行为事实源（命令、页面功能、默认值、回退）
- `AGENTS.md`：红线、审计要求、交付清单
- `contributing_ai.md`：AI 任务模板、验证与交付协议
- `player-web/README.md`：Web 端启动、导航、前端结构
- `docs/ARCHITECTURE_RULES.md`：架构分层与约束
- `docs/PLAYER_CHART_TEMPLATE.md`：CSV 模板字段规范
- `docs/ROADMAP.md`：路线图与阶段目标
- `docs/GITHUB_WORKFLOW_AND_TAGS.md`：发布流程与标签约定

## 4) 变更同步决策表

| 变更类型 | 必改文档 |
|---|---|
| 默认值变化 | `USAGE.md` |
| 字段语义变化 | `USAGE.md` + `AGENTS.md`（如触及红线） |
| 页面入口/导航变化 | `USAGE.md` + `player-web/README.md` + `README.md`（摘要） |
| 回退策略变化 | `USAGE.md` |
| API 调用方式变化 | `USAGE.md`（必要时补 `player-web/README.md`） |
| 架构分层/约束变化 | `docs/ARCHITECTURE_RULES.md`（必要时补 `AGENTS.md`） |

## 5) 快速定位

- “这个页面到底怎么用？” -> `USAGE.md`
- “这次改动算不算违规？” -> `AGENTS.md`
- “文件应该放哪层？” -> `docs/ARCHITECTURE_RULES.md`
- “要跑哪些验证？” -> `AGENTS.md` + `contributing_ai.md`

---

_最后更新：2026-03-21_
