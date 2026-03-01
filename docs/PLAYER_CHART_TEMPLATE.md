# Player Chart Template

本文件说明如何使用 `player` 项目模板生成与 `ref/01.png` 同类型图表。

---

## 1. 图表类型

当前模板生成的是：
- **径向分组条形图（pizza/radial bar）**
- 不是传统“折线连接”的经典雷达图

适合场景：
- 球员多维能力对比
- Percentile + Per90 联合展示

---

## 2. 输入模板

模板文件：`templates/player_chart_template.csv`

字段说明：

- `metric`（必填）：指标名称
- `value`（必填）：百分位，范围 `0-100`
- `group`（必填）：分组名称（Passing/Shooting 等）
- `order`（必填）：分组顺序（整数）
- `per90`（可选）：每90或原始值文本
- `tier`（可选）：`elite/above_avg/avg/bottom`
- `color`（可选）：手动颜色（hex），优先级高于 `tier`

网页端补充规则：
- Web UI 中 `tier` 会按 `value` 自动计算（仍保持 `value` 为唯一数值依据）

---

## 3. 导图命令

```bash
python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/player_demo.png \
  --title "Player Name (Age, Pos, Minutes)" \
  --subtitle "League Season Percentile Rankings & Per 90 Values"
```

---

## 4. 视觉规则

- 条形长度由 `value` 决定
- 小标签显示 `per90`
- 每个 `group` 会形成一个扇区
- `tier` 决定默认颜色分层

默认 tier 配色：
- `elite`：绿色
- `above_avg`：棕黄色
- `avg`：橙色
- `bottom`：红色

---

## 5. 批量生产建议

目录建议：

```text
data/player_charts/
  player_a.csv
  player_b.csv
  player_c.csv
```

批量导出示例：

```bash
for f in data/player_charts/*.csv; do
  base=$(basename "$f" .csv)
  python3 scripts/generate_player_radar.py \
    --input "$f" \
    --output "out/player_charts/${base}.png" \
    --title "$base" \
    --subtitle "Percentile Radar"
done
```

---

## 6. 质量检查清单

- `value` 是否都在 0-100
- `metric` 是否重复或空值
- `group/order` 是否满足预期顺序
- 输出标题是否包含球员基本信息

---

_最后更新：2026-03-01_
