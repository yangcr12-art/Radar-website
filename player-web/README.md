# player-web（Web 图表工作台）

`player-web` 是 `player` 项目的可交互前端，覆盖雷达图编辑、球员数据分析、散点图生成与映射配置。

---

## 1) 页面导航

当前导航包含 7 页：

- 主页
- 雷达图生成器
- 球员数据
- 散点图生成器
- 项目对应表
- 球队对应表
- About

品牌文案：`生成器V3.3`

---

## 2) 启动方式

## 2.1 启动后端

```bash
cd player-web/server
python3 -m pip install -r requirements.txt
python3 app.py
```

默认地址：`http://127.0.0.1:8787`

## 2.2 启动前端

```bash
cd player-web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

打开：`http://127.0.0.1:5173`

可选：

```bash
VITE_STORAGE_API_BASE=http://127.0.0.1:8787 npm run dev -- --host 127.0.0.1 --port 5173
```

---

## 3) 页面能力摘要

## 3.1 雷达图生成器

- 编辑 `metric/value/group/order/subOrder/per90/tier/color`
- 上传/粘贴 CSV
- 导出 SVG / PNG
- 标题模板、字体样式、图表样式控制
- 草稿与版本保存

## 3.2 球员数据

- 导入 Excel（需包含 `player`）
- 展示列值/排名/百分比
- 搜索并选择球员
- 勾选指标一键导入雷达图

## 3.3 散点图生成器

- 选择 X/Y 轴
- 范围筛选与坐标缩放
- 平均线（开关/颜色/粗细）
- 点样式控制（大小、边框颜色、边框粗细）
- 球员详情联动与名字显示开关
- 球队映射样式联动（颜色/形状）

## 3.4 项目对应表

- 维护字段中英映射与分组

## 3.5 球队对应表

- 维护球队中英映射
- 维护球队颜色与形状
- 从球员数据同步球队

---

## 4) 关键行为口径

1. 散点图平均值统计基于全量有效点（X/Y 可解析）。
2. 散点图筛选范围仅影响可见点和坐标缩放，不改变平均值统计。
3. 球队映射未命中时，散点颜色回退黑色。
4. 数据集无球队列（Team/Club/Squad）时，不启用球队样式并提示。

---

## 5) 持久化与数据边界

- 前端 localStorage：映射和配置等前端持久化数据
- 后端状态服务：草稿/版本统一保存与跨端口读取
- 导入数据集：后端维护，支持切换与删除

---

## 6) 开发验证

前端改动后：

```bash
cd player-web
npm run build
```

全仓建议最小验证：

```bash
python3 scripts/audit_architecture.py
python3 scripts/generate_player_radar.py \
  --input templates/player_chart_template.csv \
  --output out/player_charts/smoke_test.png \
  --title "Smoke Test" \
  --subtitle "Template Validation"
```

---

## 7) 经验教训

1. 控件布局优化不应影响统计口径。
2. 筛选行为与统计基准必须分离定义。
3. 默认值和回退策略要写进文档，否则协作会失真。
4. 页面复杂度上升时，优先收敛状态边界再扩功能。

---

_最后更新：2026-03-03_
