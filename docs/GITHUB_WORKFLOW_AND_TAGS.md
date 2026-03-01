# GitHub 更新流程与 Tag 规则

本文件定义本项目的 GitHub 协作流程、发布流程与 Tag 标记规范。

---

## 1) 日常更新流程（标准）

### 1.1 同步主分支

```bash
git checkout main
git pull origin main
```

### 1.2 新建功能分支

分支命名规则：
- `feature/<topic>`：新功能
- `fix/<topic>`：缺陷修复
- `refactor/<topic>`：重构
- `docs/<topic>`：文档改动
- `chore/<topic>`：工程维护

示例：

```bash
git checkout -b feature/player-data-export
```

### 1.3 开发与本地校验

至少执行：

```bash
python3 scripts/audit_architecture.py
cd player-web && npm run build
python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/smoke_test.png \
  --title "Smoke Test" \
  --subtitle "Template Validation"
```

如修改后端（`player-web/server/app.py` 或后端依赖），必须重启并验活：

```bash
python3 player-web/server/app.py
curl -s http://127.0.0.1:8787/api/health
```

### 1.4 提交代码

提交信息建议（Conventional Commits）：
- `feat: ...`
- `fix: ...`
- `refactor: ...`
- `docs: ...`
- `chore: ...`

示例：

```bash
git add .
git commit -m "feat: support dataset-level metric export in player data page"
```

### 1.5 推送与合并

```bash
git push -u origin <branch-name>
```

在 GitHub 发起 PR，CI 通过后合并到 `main`。

---

## 2) 发布与 Tag 规则

### 2.1 Tag 格式（强制）

使用语义化版本（SemVer）并以 `v` 前缀：
- `vMAJOR.MINOR.PATCH`

示例：
- `v1.0.0`
- `v1.2.3`

预发布版本：
- `vMAJOR.MINOR.PATCH-rc.N`（候选发布）
- `vMAJOR.MINOR.PATCH-beta.N`（测试发布）

示例：
- `v1.3.0-rc.1`
- `v2.0.0-beta.2`

### 2.2 版本递增规则

- `MAJOR`：不兼容变更（接口/行为破坏）
- `MINOR`：向后兼容的新功能
- `PATCH`：向后兼容的修复

### 2.3 打 Tag 前检查清单

- 架构审核通过：`python3 scripts/audit_architecture.py`
- 前端构建通过：`cd player-web && npm run build`
- smoke 通过（见上）
- 文档同步（`README/USAGE/AGENTS/contributing_ai`）
- 目标 commit 在 `main` 且已推送

### 2.4 创建并推送 Tag

```bash
git checkout main
git pull origin main

git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

如需一次推送全部本地 tag：

```bash
git push origin --tags
```

### 2.5 纠正错误 Tag

仅在确认误发时使用：

```bash
git tag -d v1.0.0
git push origin :refs/tags/v1.0.0
```

---

## 3) 热修复流程（Hotfix）

```bash
git checkout main
git pull origin main
git checkout -b fix/hotfix-<topic>
```

修复后完成校验、提交、推送、PR 合并，然后打补丁版本 Tag（如 `v1.0.1`）。

---

## 4) 远程与认证建议

- 远程建议使用 HTTPS（便于 PAT）
- 若 push 失败提示权限问题，检查：
  - 仓库地址是否正确
  - PAT 是否包含 `repo`（若涉及 workflow 文件，需包含 `workflow`）
  - 本机代理设置是否影响 Git 连接

