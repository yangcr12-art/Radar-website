# contributing_ai.md — AI 协作与交付协议

本文件定义 AI 在 `player` 项目中的工作方式。

---

## 0) 开始前强制阅读

- `README.md`
- `USAGE.md`
- `AGENTS.md`
- `contributing_ai.md`

**硬性要求**：每次交付必须写 `I have read: ...`。

---

## 1) 任务书模板（必须）

```text
# 任务：<一句话>

Goal:
- ...

Definition of Done (DoD):
- [ ] ...
- [ ] ...

Steps (minimal changes only):
1) ...
2) ...

Files:
- path/to/file

Commands / Tests:
- python3 scripts/audit_architecture.py
- python3 scripts/generate_player_radar.py ...

Risk Notes:
- 字段语义是否变化？
- 文档是否同步？
```

---

## 2) 代码交付原则

- 最小改动：一次只处理一个清晰目标。
- 文档同步：命令或参数变化必须同步更新 `USAGE.md`。
- 不提交产物：`out/` 下导出图不纳入仓库。
- 不伪造验证：未运行的命令必须明确说明。
- 若改动后端（`player-web/server/app.py` 或后端依赖），交付前必须重启后端并验证健康检查：
  - `python3 player-web/server/app.py`
  - `curl -s http://127.0.0.1:8787/api/health`

---

## 3) AI 常见错误（禁止）

- 写出脚本不支持的参数
- 修改 CSV 字段语义但不更新文档
- 把示例数据硬编码进逻辑层
- 没有给可复制执行命令

---

## 4) 最低验证清单

```bash
python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/ai_validation.png \
  --title "AI Validation" \
  --subtitle "player template"
```

如果环境缺依赖，必须给安装命令：

```bash
pip install matplotlib numpy
```

---

## 5) GitHub 与 Tag

- 项目 GitHub 更新流程与 Tag 规则统一遵循：`docs/GITHUB_WORKFLOW_AND_TAGS.md`
- 涉及发布版本时，必须使用 `vMAJOR.MINOR.PATCH` 语义化 Tag。

---

_最后更新：2026-03-01_
