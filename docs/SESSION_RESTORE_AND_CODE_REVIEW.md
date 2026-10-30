# 页面恢复与代码精简检查（2026-10-10）

## 任务与验收

Goal：修复闲置标签页重新加载后返回默认页，检查全项目可精简点。

DoD：页面重载恢复原位置；账号和标签页隔离；球探输入设置恢复；连接故障不伪装成退出；重复逻辑精简；现有统计测试及构建通过。

Scope：前端导航、登录检查、球探设置、API客户端及雷达显示工具。服务器会话时长、职责评分、原始数据、部署端口不变。

Risks：不能仅凭代码确认实际浏览器是否回收标签页；新标签页仍使用首次默认页，浏览器禁止sessionStorage时无法跨重载恢复。球探评分结果不缓存，须重新运行以读取最新后端数据。

## 问题依据与修复

原App将activePage初始化为radar，没有URL或持久化位置；搜索全前端未发现闲置自动导航、focus/visibilitychange跳转或location.reload。唯一显式跳回radar的业务动作是导入球员百分位，保持该联动。

浏览器若重新加载闲置标签页，内存导航必然丢失；这是一条确定的缺陷，但不能把浏览器回收当作现场已复现原因。新增usePageNavigation及账号隔离sessionStore恢复页面，不延长登录会话或跳过后端鉴权。

useSharedAuth原先将fetchAuthStatus网络失败视为anonymous并改写存储范围；现在显示unavailable状态，允许重新连接，只有明确的未登录结果或主动退出才进入登录页。

球探设置在scoutSession统一默认值与输入校验；恢复的数据集、职责须经实际列表验证。后台评分结果和临时榜单状态不缓存。

## 全项目扫描与优化落点

对前端72个、后端核心35个、脚本7个、部署7个源文件进行文件级扫描（新增公共工具前的快照），并检查全部Python语法、导航副作用、重复函数名称、文件规模、持久化边界。重点人工阅读登录、导航、水合、自动保存、球探与API链路。扫描不等于逐行证明所有代码没有问题。

| 项目 | 证据与处理 |
| --- | --- |
| API请求重复 | JSON、FormData、Blob及StatsBomb重复配置超时、鉴权、错误解析；已统一sendRequest，保留8秒/30秒超时、凭据及上传/下载差异 |
| 雷达工具重复 | 三页的normalizeHexColor、clampRatio、polygonPath、colorToAlpha逐字一致；已抽入radarGeometry。比赛雷达的pointAt绑定专用中心，未合并 |
| 超大页面 | 体能1729行、积分走势1272行、App约1150行、球探约1070行、比赛雷达1039行；适合后续按导入/设置/图表拆分，每次独立验证 |
| 映射与导出重复 | escapeCsvCell五处、downloadBlobFile四处、downloadFile七处；需先核对BOM、文件名、下载释放和格式边界，再统一，不能仅按同名删除 |
| 数值转换 | parseNumericValue五处；各页面格式和统计语义有差异，保留至边界测试补齐 |
| 后端路由规模 | fitness_data_api约1105行、csl_standings_api671行，部分解析可移入service；本轮不改动上传/解析行为 |
| 样式 | scout-search.css约2002行；重复选择器可能为级联覆盖，不能按重复行机械删除 |
| 构建与类型检查 | npm run build仅执行Vite，无独立TypeScript检查；本次未安装新工具。建议后续先建立兼容基线再加类型检查门禁 |
| 包体积 | 既有单入口构建超过500KB提示；可考虑按页面加载，但必须验证部署更新时旧标签页加载旧分块失败的恢复路径 |
| 服务持久化 | state和mappings已分域；生产单worker约束保留，不改成多worker来掩盖文件存储的并发限制 |

## 行为不变性清单

- 入口：既有菜单/页面键、首次雷达页、球员数据导入后的雷达联动、登录/退出接口不变；只新增重载位置恢复与连接失败重试。
- 工作台：草稿、版本、模板、导入导出、对应表保存路径及自动保存周期不变。
- 球探：模型、职责权重、准入、百分位、可靠度、尖点、排名与贡献公式不变；恢复输入不自动运行或复用旧评分。
- 雷达/散点：几何工具保持原函数内容；图表数据、均值基准、缩放、透明度、颜色优先级及导出不变。
- 其他页面：比赛、体能、积分、Opta、StatsBomb保留原入口及字段；API客户端保持表单、二进制下载、错误消息、credentials和超时语义。
- 存储：新增会话键均按账号隔离，仅保存页面/输入；既有localStorage键与后端字段不变，后端未改动，无需重启。

## 验证与可复现命令

```bash
node scripts/check_frontend_session.mjs
python3 scripts/audit_architecture.py
MPLBACKEND=Agg MPLCONFIGDIR=/private/tmp/player-radar-mpl python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title "Smoke Test" --subtitle "Template Validation"
(cd player-web/server && python3 -m unittest discover -s tests)
(cd player-web && npm run build)
git diff --check
```

检查通过：前端会话/账号隔离/导航重载/设置校验/离线登录重试与API兼容测试；101项后端测试；架构审核；模板出图；前端构建。构建仍有既有500KB包体积提示。

未执行：真实浏览器长时间闲置回收、线上服务器部署、独立TypeScript全项目检查、依赖漏洞联网复核。浏览器验收步骤：进入球探修改职责和门槛、刷新确认原页与设置；切到其他账号确认隔离；暂时断网刷新显示重连、恢复网络点击重连返回原页；重新运行模型比较同一输入的结果。

已有未提交的后卫/门将/球探业务改动在开始前即存在，不属于本轮优化；本轮101项测试验证的是当前工作区，不能替代远端版本的发布验收。

I have read: AGENTS.md §0–8、README.md §1/4/5/6、USAGE.md §3/4.1/4.15/5/9、contributing_ai.md §0–6、docs/ARCHITECTURE_RULES.md。

## 工作台布局与主页/About更新

- 修改HomePage.tsx、AboutPage.tsx、home-about.css、styles/base.css、styles/editor.css及USAGE.md。
- 桌面导航改为内容自适应；1100px以下不再整块吸顶，保留菜单顺序和两列/单列规则。信息页顶部对齐，不改变图表输出。
- 主页九类功能卡片共18个分析/维护入口取自NAV_ITEMS；对应表原“仅展示”改为四个入口，About保留独立入口。
- 品牌卡使用“Football Intelligence / 洞察比赛·理解球员”，无操作说明；About按git历史和USAGE整理16个重大阶段，覆盖2026-03至2026-10-10。署名为“制作：YCR · 技术指导：大飞”。
- 实际检查1280px桌面、820px平板、390px手机宽度：主页和About无横向溢出；平板双列、手机单列，导航换行后增高，窄屏随页面滚动。
- 行为不变性：已有导航、页面键、登录/退出、业务页面、统计与导出不变；新增主页快捷入口和布局/文案调整，使用说明已同步。
- 预览图位于out/workspace-layout/；尚未线上部署，未在业务页面执行导入/删除操作。
