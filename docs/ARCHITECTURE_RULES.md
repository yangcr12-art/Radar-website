# Architecture Rules

本文件定义 `player` 项目网页端与后端服务的架构约束，用于保证可维护与可扩展。

## 1) 前端架构（Feature-Sliced）

目录分层：
- `player-web/src/app`：应用壳、入口级装配
- `player-web/src/pages`：页面级组件
- `player-web/src/widgets`：页面复合区块
- `player-web/src/features`：用户动作能力
- `player-web/src/entities`：核心业务实体
- `player-web/src/shared`：通用 API / UI / 工具

依赖方向：
- `pages` 可依赖 `widgets/features/entities/shared`
- `features` 可依赖 `entities/shared`
- `entities` 仅依赖 `shared`
- `shared` 不依赖其他层

禁止项：
- `pages/*` 直接调用 `fetch`
- `pages/*` 直接操作 `localStorage`
- 新功能继续堆叠到超大单文件（如单文件 > 2000 行）

## 2) 后端架构（模块化 Flask）

目录分层：
- `player-web/server/app.py`：HTTP 入口与路由编排
- `player-web/server/server_core/services`：业务逻辑（排名、规整、导入规则）

依赖方向：
- 路由层不内嵌复杂排名算法
- 业务口径单点在 `services` 维护

禁止项：
- 在多个文件重复实现同一排名口径
- 修改口径而不更新文档与审核规则

## 3) 自动化审核（阻断）

审核脚本：`python3 scripts/audit_architecture.py`

规则来源：`scripts/audit_rules.yml`

输出：
- `out/architecture_audit_report.json`
- `out/architecture_audit_report.md`

阻断策略：
- 任一规则违规，脚本返回非零退出码。

## 4) 执行要求

本地：
- 开发前或提交前运行：`python3 scripts/audit_architecture.py`

CI：
- 每次 push / PR 必跑架构审核、前端 build、Python smoke。

