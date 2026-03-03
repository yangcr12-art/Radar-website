# GitHub Workflow And Tags

本文件定义 `player` 项目的 Git 工作流、提交规范与版本标签规则。

---

## 1) 分支策略

推荐：

- `main`：稳定主分支
- `feature/<topic>`：功能开发
- `fix/<topic>`：缺陷修复
- `docs/<topic>`：文档专项更新

标准流程：

```bash
git checkout main
git pull origin main
git checkout -b feature/<topic>
```

---

## 2) 提交规范

提交信息建议：

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `refactor: ...`
- `chore: ...`

要求：

- 一个提交只解决一个清晰目标
- 功能变更必须包含对应文档变更
- 文档变更尽量与功能提交同批，避免脱节

---

## 3) 推送与合并

```bash
git add .
git commit -m "feat: <message>"
git push -u origin feature/<topic>
```

建议通过 PR 合并，至少包含：

- 变更摘要
- 影响范围
- 验证命令与结果
- 是否涉及口径/默认值变化

---

## 4) Tag 规范

版本标签采用语义化：`vMAJOR.MINOR.PATCH`

示例：

```bash
git checkout main
git pull origin main
git tag -a v3.3.0 -m "Release v3.3.0"
git push origin v3.3.0
```

语义：

- `MAJOR`：不兼容或规则重大变更
- `MINOR`：新增功能且兼容
- `PATCH`：兼容性修复

---

## 5) 文档专项发布建议

当本次发布含规则或口径更新时：

- 在 PR 描述中单独列出“规则更新”
- 在 `USAGE.md` 增加“行为更新记录”
- 必要时在 `AGENTS.md` 同步红线或审计要求

---

## 6) 常见问题

1. SSH 推送失败
- 可切换远端到 HTTPS 再推送

2. 文档与代码不同步
- 以 `AGENTS.md` + `USAGE.md` 为修正基准

3. 提交后发现默认值改动未记录
- 补充 `docs:` 提交并在 PR 里说明影响

---

## 7) 经验教训

- 规则变化不进发布说明，会造成协作方误用。
- 文档更新滞后是最常见回归来源之一。
- 小步提交比大杂烩提交更易审计和回滚。

---

_最后更新：2026-03-03_
