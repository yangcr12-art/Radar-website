# Documentation Map

本文件提供 `player` 仓库的文档导航与使用顺序。

## 1) 阅读优先级（高 -> 低）

1. `AGENTS.md`
2. `USAGE.md`
3. `README.md`
4. `docs/*` 与 `player-web/README.md`

## 2) 场景入口

### 新成员 10 分钟上手

1. `README.md`：项目定位、最短闭环
2. `USAGE.md`：命令与页面行为事实
3. `player-web/README.md`：前端页面能力与启动方式

### 做功能改动前

1. `AGENTS.md`：红线与口径契约
2. `USAGE.md`：现有默认值与回退策略
3. `contributing_ai.md`：任务模板与交付格式

### 做架构/重构前

1. `docs/ARCHITECTURE_RULES.md`
2. `docs/ROADMAP.md`
3. `docs/GITHUB_WORKFLOW_AND_TAGS.md`

## 3) 文档职责边界

- `README.md`：项目入口与能力总览
- `USAGE.md`：可执行命令 + 可验证行为
- `AGENTS.md`：最高优先级规则与审计清单
- `contributing_ai.md`：AI 协作协议
- `player-web/README.md`：Web 端能力与开发说明
- `docs/PLAYER_CHART_TEMPLATE.md`：CSV 字段模板规则
- `docs/ARCHITECTURE_RULES.md`：架构约束与分层规则
- `docs/ROADMAP.md`：阶段规划
- `docs/GITHUB_WORKFLOW_AND_TAGS.md`：发布流程与标签策略

## 4) 变更同步规则

满足任一条件，必须至少同步 `USAGE.md`：

- 默认值变化
- 字段语义变化
- 页面入口/导航变化
- 回退策略变化
- API 调用方式变化

若涉及全局红线或审计策略，额外同步 `AGENTS.md`。

---

_最后更新：2026-03-18_
