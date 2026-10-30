# 任务：保留现有暖色及布局，统一页面外观

Goal：在已恢复的界面上统一暖白、米色、深棕色彩，保持各页面和子菜单的现有布局与功能。

DoD：21页检查；无乱码；雷达左右布局、表格紧凑尺寸、按钮与输入框尺寸不变；图表、评分色及打印独立；通过最低验证。

Scope：新增screen限定的warm-theme.css及main.tsx导入。不改组件、导航、业务数据、存储、算法或后端。

Implementation Notes：统一普通面板、表单、表头、焦点与按钮颜色；主页深绿装饰、个人体能蓝灰、StatsBomb冷色侧栏改用当前暖色系。保留成功/错误状态色、评分分级、球员与球队图表色。不新增padding、字体字号、控件宽高或定位规则。例外为已确认的容器溢出：信息页及职责算法库使用可收缩的单列网格，信息卡限制在父容器内；680px以下球队数据的现有两列改为纵向排布，移除左栏固定basis撑宽。桌面雷达46%/54%与表格内部结构不变。

用户截图发现的职责算法库暗底暗标题已修正：撤除通用h1/h2/h3深色覆盖，让深色横幅继续使用原有浅色标题，个人体能的浅底标题单独指定。未全局覆盖所有标题。

Files：player-web/src/styles/warm-theme.css、player-web/src/main.tsx、USAGE.md、本文件。

行为不变性清单：21页及所有导航/子菜单入口不变；雷达46%/54%固定居中预览、紧凑表格、折叠状态不变；数据源、value百分位/per90标注、散点全量有效点均值、球探评分、体能场均和分均、StatsBomb权限与隔离、映射保存均不变；SVG/PNG图表内容与打印样式不变。无组件结构重排，无业务默认值或字段语义变化。

Commands / Tests：
```bash
python3 scripts/audit_architecture.py
MPLBACKEND=Agg MPLCONFIGDIR=/private/tmp/player-mpl-cache python3 scripts/generate_player_radar.py --input templates/player_chart_template.csv --output out/player_charts/smoke_test.png --title "Smoke Test" --subtitle "Template Validation"
node scripts/check_frontend_session.mjs
node scripts/check_radar_import_and_fitness_session.mjs
npm run build --prefix player-web
```

Risks：不在真实数据上测试删除/导入覆盖，不修改已保存图表字号。桌面及窄屏以现有结构为基准；原有表格内部滚动继续保留。无后端修改、不部署线上。

验证：21页1440px下均未出现页面横向溢出，未发现替换字符乱码；当前显示状态下检查深色背景文字，未发现低于相应字号对比阈值的文字（渐变按底层颜色近似，另目测横幅）。420px检查后修复球队数据和职责算法库外层溢出，两页复测scrollWidth=420。导航布局保留原有窄屏样式。构建、架构审计、模板雷达、会话恢复与导入保护回归通过；仍有既有主包大于500kB提示。不宣称完成所有数据组合、隐藏状态或全面无障碍认证。

I have read: README 1–6、USAGE 4.1/4.2/5/9、AGENTS 0–8、contributing_ai 0–6，以及base/editor/home-about/match-pages/statsbomb/scout-search/fitness-history样式。
