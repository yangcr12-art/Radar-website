# Architecture Rules

本文件定义 `player` 项目的架构约束与审核原则，用于保证长期可维护、可审计、可复现。

---

## 1) 前端架构约束（player-web）

推荐分层：

- `src/pages`：页面级组件
- `src/hooks`：页面复用状态逻辑
- `src/utils`：纯函数、映射、存储工具
- `src/api`：后端 API 客户端
- `src/app`：跨页面常量与规则（默认值、键名、口径）
- `src/styles.css`：样式入口（仅导入，不承载大段规则）
- `src/styles/*.css`：全局基础与通用样式分层
- `src/home-about.css`、`src/match-pages.css`：页面特化样式

依赖方向：

- `pages` -> `hooks/utils/api/app`
- `hooks` -> `utils/api/app`
- `utils` 不依赖 `pages`
- `api` 不依赖 `pages`

禁止项：

- 页面组件直接内嵌复杂数据规整逻辑（应抽到 `hooks/utils`）
- 同一映射规则在多个页面重复实现
- 持续堆叠超大单文件而不拆分（建议 >900 行即拆分）
- 在 `src` 新增 JavaScript 源文件（统一 `.ts/.tsx`）

---

## 2) 后端架构约束（Flask）

目录职责：

- `player-web/server/app.py`：HTTP 入口
- `player-web/server/server_core/routes/*`：路由编排
- `player-web/server/server_core/services/*`：业务规则与计算

禁止项：

- 在路由层重复实现业务口径
- 同一规则在多处复制
- 改变服务口径而不更新文档

---

## 3) 数据与状态边界

1. 会话态：组件内临时交互状态
2. 前端持久化：localStorage（UI 配置、映射草稿）
3. 后端持久化：跨端口一致读取的数据与草稿

规则：

- 新增持久化键必须有命名与兼容策略
- 同一语义不得在多处冲突持久化
- 按数据集维度保存的状态必须防止切页误清空

---

## 4) 统计口径分层

必须分离：

- 统计基准（如平均线全量有效点）
- 可见筛选结果（仅影响显示）
- 视觉样式（颜色、字号、边框等）

禁止：

- 用样式或筛选行为改变统计口径

---

## 5) 文档一致性规则

以下变更必须同步文档：

- 默认值变化
- 回退策略变化
- 字段语义变化
- 页面导航变化
- 命令入口变化

最低同步：`USAGE.md`；涉及全局规则再同步 `AGENTS.md`。

---

## 6) 自动化审核

```bash
python3 scripts/audit_architecture.py
```

产物：

- `out/architecture_audit_report.json`
- `out/architecture_audit_report.md`

规则文件：`scripts/audit_rules.yml`

策略：任一规则违规 -> 非零退出码。

---

## 7) 经验教训（架构视角）

1. 布局优化应落在样式层，不应修改业务语义层。
2. 状态持久化必须单点定义，避免同语义漂移。
3. 回退策略应工具层统一，不应散落在页面临时判断。

---

_最后更新：2026-03-18_
