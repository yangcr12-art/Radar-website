# PLAYER_CHART_TEMPLATE

本文件定义球员图模板字段语义、约束与常见错误修复方式。  
字段口径与 `AGENTS.md`、`USAGE.md` 保持一致。

说明：Web 前端已迁移为 TypeScript，但模板字段语义与导入口径不变。

---

## 1) 标准字段

必填：

- `metric`：指标名称
- `value`：百分位值（0-100）
- `group`：指标分组
- `order`：分组顺序（整数）

可选：

- `subOrder`：组内排序（整数）
- `per90`：每 90 数值，仅展示
- `tier`：颜色层级（`elite/above_avg/avg/bottom`）
- `color`：手动颜色覆盖（hex）

---

## 2) 字段语义与计算影响

- `value`：唯一参与长度计算的核心数值
- `per90`：不参与长度计算，仅用于文本标注
- `group + order`：决定分区归属与主排序
- `subOrder`：同分区内排序细化
- `tier/color`：只影响视觉，不改变数值

---

## 3) 约束

- `value` 必须在 `0-100`
- `order/subOrder` 应为整数
- `metric/group` 不得为空
- `color` 建议为合法 hex（如 `#2f7fc4`）

---

## 4) 与 Web 一键导入口径对齐

从“球员数据”一键导入时：

- `value = 百分比`
- `per90 = 该球员原始列值`
- `metric` 优先中文映射
- `group` 优先项目对应表配置

这是一致性规则，不应在导入流程中被改写。

---

## 5) 示例

```csv
metric,value,group,order,subOrder,per90,tier,color
Long Pass %,71.43,Passing,1,1,6.12,above_avg,
Aerial Win %,44.00,Defending,2,1,3.21,avg,
npxG,38.00,Shooting,4,2,0.38,avg,#d97706
```

---

## 6) 常见错误与修复

1. `value` 超出范围
- 错误：`value=132`
- 修复：改为 `0-100` 区间内百分位

2. `order` 非整数
- 错误：`order=2.5`
- 修复：改为整数并按分组规则重排

3. 混淆 `value` 与 `per90`
- 错误：把原始数值写入 `value`
- 修复：`value` 保持百分位，原始值放 `per90`

4. `tier` 与 `value`冲突
- Web 默认会按 `value` 自动联动 `tier`
- 若手动维护，需保证语义一致

---

## 7) 经验教训

- 模板字段越清晰，后续页面功能越稳定。
- “可视化需求”不应倒逼字段语义漂移。
- 导入链路必须把来源字段写清楚，避免后续统计争议。

---

_最后更新：2026-03-03_
