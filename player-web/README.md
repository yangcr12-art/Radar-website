# player-web（React 球员雷达图网页）

这是一个可交互网页：
- 基于标准 CSV 字段 `metric,value,group,order,per90,tier,color`
- 左侧表格可编辑数据，右侧实时渲染雷达/径向图
- 支持上传 CSV、下载当前 CSV、导出 SVG/PNG
- 支持后端统一持久化（跨 `localhost/127.0.0.1/端口` 读取同一份草稿与版本）
- 支持在“球员数据”页导入 Excel（`.xlsx`）并生成列级排名/百分比
- 支持按导入数据集下拉切换与删除当前数据集

## 1. 安装 Node.js（20+）

```bash
node -v
npm -v
```

## 2. 安装依赖

```bash
cd player-web
npm install
```

## 3. 启动后端存储服务（推荐）

```bash
cd player-web/server
python3 -m pip install -r requirements.txt
python3 app.py
```

默认监听：`http://127.0.0.1:8787`

## 4. 启动前端开发服务器

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

打开：`http://127.0.0.1:5173`

可选：通过环境变量指定后端地址

```bash
VITE_STORAGE_API_BASE=http://127.0.0.1:8787 npm run dev -- --host 127.0.0.1 --port 5173
```

## 5. 使用方式

1. 输入主标题/副标题
2. 可在“标题模板”里填写球员信息，一键生成示例风格标题
3. 直接在表格编辑指标，或点击“上传 CSV”导入球员数据
4. 也可直接粘贴 CSV 文本并导入
5. 点击“下载 CSV”可导出当前数据（保证可复现）
6. 点击“导出 SVG/PNG”得到图片
7. CSV 可用中英文表头；层级支持 `elite/above_avg/avg/bottom` 或 `顶级/良好/中等/较弱`
8. 可在“图表文字样式”里调整字体与分组字号（仅影响右侧图和导出图片）
9. 当前编辑会实时自动保存到后端（后端不可用时回退本地缓存）；可“保存当前为版本”并通过下拉切换版本
10. 标题模板与字体样式卡片支持下拉折叠/展开
11. 如果当前正在编辑某个已保存版本，修改会实时回写到该版本（关闭网页后仍保留）
12. 若上次选中版本不存在或损坏，会自动回退到“当前草稿”
13. 图表样式支持圆线粗细与虚线/实线切换（含虚线间隔）
14. 网页端 `tier` 会按 `value` 自动联动（不可手动改）：
    - `>=90`：`elite`
    - `65-89.99`：`above_avg`
    - `34-64.99`：`avg`
    - `<34`：`bottom`
15. 右下角图例为中文口径：顶级（前10%）/高于平均（11%-35%）/平均（36%-66%）/低于平均（后35%）
16. 版本保存范围：`title/subtitle/rows/meta/textStyle/chartStyle`（数据+图表样式+标题信息）
17. 版本不保存：卡片折叠状态、临时粘贴文本框内容
18. 选中某版本后，所有编辑会实时回写该版本；下拉会显示版本更新时间
19. 可上传中心图片并调整大小，图片仅显示在中心圆范围内
20. 中心图片与图表数据/样式一起保存到草稿和版本
21. 首次接入后端时，会自动迁移一次浏览器本地保存的数据
22. “球员数据”页支持导入 Excel（宽表：一行一个球员，且必须有 `player` 列）
23. 导入后可通过下拉切换球员，并查看每列：列标题/数值/排名/百分比（排名按数值降序、并列跳号）

## 6. CSV 规则

必填列：`metric,value,group,order`
可选列：`per90,tier,color`

约束：
- `value` 在 `0-100`
- `order` 必须是整数
- `metric/group` 不能为空
- `tier` 建议值：`elite/above_avg/avg/bottom`

## 7. 关键文件

- `src/App.jsx`：页面逻辑、CSV 读写、图表渲染
- `src/api/storageClient.js`：后端存储 API 客户端
- `server/app.py`：Flask 后端（状态存储 + 球员 Excel 导入 API）
- `src/styles.css`：页面样式
- `src/main.jsx`：React 入口
