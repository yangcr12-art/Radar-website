# player-web（Web 图表工作台）

`player-web` 是 `player` 项目的可交互前端，覆盖雷达图编辑、球员数据分析、散点图生成与映射配置。

前端技术栈：`React + Vite + TypeScript`（`src` 仅 `.ts/.tsx`）。

---

## 1) 页面导航

当前导航包含 8 页：

- 主页
- 球员数据
- 雷达图生成器
- 散点图生成器
- 项目对应表
- 姓名对应表
- 球队对应表
- About

品牌文案：`生成器V3.3`

---

## 2) 启动方式

可选一键启动（仓库根目录执行，会先等待后端健康后再起前端）：

```bash
bash scripts/start_player_web_dev.sh
```

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
- 图表样式支持右图背景色
- 图表样式区桌面端三列排布，图片设置区统一选项块与紧凑行距
- 草稿与版本保存

## 3.2 球员数据

- 导入 Excel（需包含 `player`）
- 导入前检查后端健康；后端不可达时导入按钮禁用并提示
- 展示列值/排名/百分比
- 搜索并选择球员
- 勾选指标一键导入雷达图
- 一键导入雷达图时，同步刷新标题模板中英文姓名、年龄、位置（中文来自姓名对应表）

## 3.3 散点图生成器

- 选择 X/Y 轴
- 可在数据集控制区删除当前数据集
- 范围筛选与坐标缩放
- 平均线（开关/颜色/粗细）
- 点样式控制（大小、边框颜色、边框粗细）
- 样式区支持背景色控制
- 球员详情联动与名字显示开关
- 球队映射样式联动（颜色/形状）

## 3.4 项目对应表

- 维护字段中英映射与分组

## 3.5 姓名对应表

- 维护球员中英姓名映射与球队字段
- 导入 Excel（.xlsx）姓名列（优先 `Player` / `Name`）
- 导入时读取球队列并按球队对应表映射为中文球队（未命中留空）
- 保留已有中文，仅补空值中文
- 批量补全中文名（离线音译，仅补空值）
- 从球员数据同步姓名
- 一键删除现有姓名（清空表）
- 下载姓名映射 CSV

## 3.6 球队对应表

- 维护球队中英映射
- 维护球队颜色与形状
- 从球员数据同步球队

---

## 4) 关键行为口径

1. 散点图平均值统计基于全量有效点（X/Y 可解析）。
2. 散点图筛选范围仅影响可见点和坐标缩放，不改变平均值统计。
3. 球队映射未命中时，散点颜色回退黑色。
4. 数据集无球队列（Team/Club/Squad）时，不启用球队样式并提示。
5. 散点图球员名显示优先使用姓名对应表中文名，未命中回退英文。
6. 雷达图标题球员名使用 `English 中文`（中英文空格分隔），未命中中文时仅显示英文。
7. 雷达图标题模板支持手动填写中文名，填写后优先使用手填值。

---

## 5) 持久化与数据边界

- 前端 localStorage：映射和配置等前端持久化数据
- 后端状态服务：草稿/版本统一保存与跨端口读取
- 导入数据集：后端维护，支持切换与删除
- 兼容策略：localStorage 键名与后端 API 字段保持兼容，不做破坏式迁移

---

## 6) 开发验证

前端改动后：

```bash
cd player-web
npm run build
```

导入链路冒烟（后端需已启动）：

```bash
bash scripts/smoke_test_dataset_import.sh
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

_最后更新：2026-03-04_
