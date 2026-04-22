import React from "react";
import {
  BAR_INNER_GAP,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CENTER_X,
  CENTER_Y,
  DEFAULT_TIER_COLORS,
  FONT_OPTIONS,
  INNER_RING,
  MAX_RADIAL_LENGTH,
  METRIC_LABEL_RADIUS,
  TIER_LABELS
} from "../app/constants";
import { annularSectorPath, colorToAlpha, polarPoint } from "../app/radar/radarState";
import { formatPresetTime } from "../utils/timeFormat";

function RadarEditorPage(props: any) {
  const {
    title,
    setTitle,
    subtitle,
    setSubtitle,
    saveName,
    setSaveName,
    handleSavePreset,
    selectedPresetId,
    handleSwitchPreset,
    presets,
    handleDeletePreset,
    titlePanelOpen,
    setTitlePanelOpen,
    meta,
    updateMeta,
    applyTitleTemplate,
    fontPanelOpen,
    setFontPanelOpen,
    textStyle,
    updateTextStyle,
    chartStyle,
    updateChartStyle,
    imagePanelOpen,
    setImagePanelOpen,
    onCenterImageClick,
    clearCenterImage,
    centerImage,
    updateCenterImageScale,
    centerImageInputRef,
    onCenterImageChange,
    onCornerImageClick,
    clearCornerImage,
    cornerImage,
    updateCornerImage,
    cornerImageInputRef,
    onCornerImageChange,
    addRow,
    downloadCsv,
    onUploadClick,
    exportSvg,
    exportPng,
    fileInputRef,
    onCsvFileChange,
    message,
    error,
    dataTablePanelOpen,
    setDataTablePanelOpen,
    rows,
    updateCell,
    moveRow,
    removeRow,
    sortedRows,
    stats,
    groupLabelLayouts
  } = props;

  return (
    <div className="page">
      <div className="left-panel">
        <h1>雷达图生成器</h1>

        <div className="title-row">
          <label>主标题</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="title-row">
          <label>副标题</label>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </div>

        <div className="save-section">
          <p className="meta-title">保存与版本切换</p>
          <div className="save-grid">
            <input
              placeholder="输入版本名，例如：武磊-2025"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <button onClick={handleSavePreset}>保存当前为版本</button>
            <select value={selectedPresetId} onChange={(e) => handleSwitchPreset(e.target.value)}>
              <option value="draft">当前草稿（自动保存）</option>
              {presets.map((preset: any) => (
                <option key={preset.id} value={preset.id}>
                  {`${preset.name}${formatPresetTime(preset.updatedAt) ? ` · ${formatPresetTime(preset.updatedAt)}` : ""}`}
                </option>
              ))}
            </select>
            <button onClick={handleDeletePreset} disabled={selectedPresetId === "draft"}>
              删除当前版本
            </button>
          </div>
        </div>

        <div className="meta-section">
          <button type="button" className="section-toggle" onClick={() => setTitlePanelOpen((prev: boolean) => !prev)}>
            <span>标题模板（可选）</span>
            <span>{titlePanelOpen ? "▾" : "▸"}</span>
          </button>
          {titlePanelOpen ? (
            <div className="section-body">
              <div className="meta-grid">
                <input placeholder="球员名" value={meta.player} onChange={(e) => updateMeta("player", e.target.value)} />
                <input placeholder="中文名(可选)" value={meta.playerZh} onChange={(e) => updateMeta("playerZh", e.target.value)} />
                <input placeholder="年龄" value={meta.age} onChange={(e) => updateMeta("age", e.target.value)} />
                <input placeholder="位置" value={meta.position} onChange={(e) => updateMeta("position", e.target.value)} />
                <input placeholder="分钟" value={meta.minutes} onChange={(e) => updateMeta("minutes", e.target.value)} />
                <input placeholder="球队" value={meta.club} onChange={(e) => updateMeta("club", e.target.value)} />
                <input placeholder="联赛" value={meta.league} onChange={(e) => updateMeta("league", e.target.value)} />
                <input placeholder="赛季(如2025)" value={meta.season} onChange={(e) => updateMeta("season", e.target.value)} />
              </div>
              <button onClick={applyTitleTemplate}>应用标题模板</button>
            </div>
          ) : null}
        </div>

        <div className="style-section">
          <button type="button" className="section-toggle" onClick={() => setFontPanelOpen((prev: boolean) => !prev)}>
            <span>图表样式</span>
            <span>{fontPanelOpen ? "▾" : "▸"}</span>
          </button>
          {fontPanelOpen ? (
            <div className="section-body">
              <div className="style-grid">
                <label>字体</label>
                <select value={textStyle.fontFamily} onChange={(e) => updateTextStyle("fontFamily", e.target.value)}>
                  {FONT_OPTIONS.map((font) => (
                    <option key={font.label} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                </select>

                <label>主标题字号</label>
                <input type="number" max="48" value={textStyle.titleSize} onChange={(e) => updateTextStyle("titleSize", e.target.value)} />
                <label>副标题字号</label>
                <input type="number" max="48" value={textStyle.subtitleSize} onChange={(e) => updateTextStyle("subtitleSize", e.target.value)} />
                <label>指标字号</label>
                <input type="number" max="48" value={textStyle.metricSize} onChange={(e) => updateTextStyle("metricSize", e.target.value)} />
                <label>分组字号</label>
                <input type="number" max="48" value={textStyle.groupSize} onChange={(e) => updateTextStyle("groupSize", e.target.value)} />
                <label>per90字号</label>
                <input type="number" max="48" value={textStyle.per90Size} onChange={(e) => updateTextStyle("per90Size", e.target.value)} />
                <label>刻度字号</label>
                <input type="number" max="48" value={textStyle.tickSize} onChange={(e) => updateTextStyle("tickSize", e.target.value)} />
                <label>图例字号</label>
                <input type="number" max="48" value={textStyle.legendSize} onChange={(e) => updateTextStyle("legendSize", e.target.value)} />
                <label>外圈线宽</label>
                <input type="number" max="8" step="0.1" value={chartStyle.ringStrokeWidth} onChange={(e) => updateChartStyle("ringStrokeWidth", e.target.value)} />
                <label>中心圆线宽</label>
                <input type="number" max="8" step="0.1" value={chartStyle.innerRingStrokeWidth} onChange={(e) => updateChartStyle("innerRingStrokeWidth", e.target.value)} />
                <label>圆线样式</label>
                <select value={chartStyle.ringLineStyle} onChange={(e) => updateChartStyle("ringLineStyle", e.target.value)}>
                  <option value="dashed">虚线</option>
                  <option value="solid">实线</option>
                </select>
                <label>虚线间隔</label>
                <input value={chartStyle.ringDasharray} onChange={(e) => updateChartStyle("ringDasharray", e.target.value)} placeholder="4 8" />
                <label>分组标题半径</label>
                <input type="number" value={chartStyle.groupLabelRadius} onChange={(e) => updateChartStyle("groupLabelRadius", e.target.value)} />
                <label>分组线粗细</label>
                <input type="number" min="0.2" max="8" step="0.1" value={chartStyle.groupSeparatorWidth} onChange={(e) => updateChartStyle("groupSeparatorWidth", e.target.value)} />
                <label>分组线长短</label>
                <input type="number" min="-120" max="240" step="1" value={chartStyle.groupSeparatorLength} onChange={(e) => updateChartStyle("groupSeparatorLength", e.target.value)} />
                <label>分组线偏移</label>
                <input type="number" min="-120" max="240" step="1" value={chartStyle.groupSeparatorOffset} onChange={(e) => updateChartStyle("groupSeparatorOffset", e.target.value)} />
                <label>分组标题X偏移</label>
                <input type="number" value={chartStyle.groupLabelOffsetX} onChange={(e) => updateChartStyle("groupLabelOffsetX", e.target.value)} />
                <label>分组标题Y偏移</label>
                <input type="number" value={chartStyle.groupLabelOffsetY} onChange={(e) => updateChartStyle("groupLabelOffsetY", e.target.value)} />
                <label>右图背景色</label>
                <input type="color" className="square-color-picker" value={chartStyle.backgroundColor || "#f8f5ef"} onChange={(e) => updateChartStyle("backgroundColor", e.target.value)} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="image-section">
          <button type="button" className="section-toggle" onClick={() => setImagePanelOpen((prev: boolean) => !prev)}>
            <span>图片设置</span>
            <span>{imagePanelOpen ? "▾" : "▸"}</span>
          </button>
          {imagePanelOpen ? (
            <div className="section-body">
              <p className="meta-title image-subtitle">中心图片</p>
              <div className="image-option-grid">
                <div className="image-option-card">
                  <label>选择图片</label>
                  <button onClick={onCenterImageClick}>选择电脑图片</button>
                </div>
                <div className="image-option-card">
                  <label>清除图片</label>
                  <button onClick={clearCenterImage} disabled={!centerImage.src}>清除图片</button>
                </div>
                <div className="image-option-card">
                  <label>图片大小</label>
                  <div className="image-size-controls">
                    <input type="range" min="0.5" max="2.5" step="0.01" value={centerImage.scale} onChange={(e) => updateCenterImageScale(e.target.value)} disabled={!centerImage.src} />
                    <input type="number" min="0.5" max="2.5" step="0.01" value={centerImage.scale} onChange={(e) => updateCenterImageScale(e.target.value)} disabled={!centerImage.src} />
                  </div>
                </div>
                <input ref={centerImageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden-file" onChange={onCenterImageChange} />
              </div>

              <p className="meta-title image-subtitle">左上角图片</p>
              <div className="image-option-grid">
                <div className="image-option-card">
                  <label>选择图片</label>
                  <button onClick={onCornerImageClick}>选择电脑图片</button>
                </div>
                <div className="image-option-card">
                  <label>清除图片</label>
                  <button onClick={clearCornerImage} disabled={!cornerImage.src}>清除图片</button>
                </div>
                <div className="image-option-card">
                  <label>图片大小(px)</label>
                  <div className="image-size-controls">
                    <input type="range" min="20" max="400" step="1" value={cornerImage.size} onChange={(e) => updateCornerImage("size", e.target.value)} />
                    <input type="number" min="20" max="400" step="1" value={cornerImage.size} onChange={(e) => updateCornerImage("size", e.target.value)} />
                  </div>
                </div>
                <div className="image-option-card">
                  <label>位置(X/Y)</label>
                  <div className="image-position-inputs">
                    <input type="number" step="1" value={cornerImage.x} onChange={(e) => updateCornerImage("x", e.target.value)} />
                    <input type="number" step="1" value={cornerImage.y} onChange={(e) => updateCornerImage("y", e.target.value)} />
                  </div>
                </div>
                <input ref={cornerImageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden-file" onChange={onCornerImageChange} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="btn-row">
          <button onClick={addRow}>新增行</button>
          <button onClick={downloadCsv}>下载 CSV</button>
          <button onClick={onUploadClick}>上传 CSV</button>
          <button onClick={exportSvg}>导出 SVG</button>
          <button onClick={exportPng}>导出 PNG</button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden-file" onChange={onCsvFileChange} />
        </div>
        {message ? <p className="msg ok">{message}</p> : null}
        {error ? <p className="msg err">{error}</p> : null}

        <div className="meta-section">
          <button type="button" className="section-toggle" onClick={() => setDataTablePanelOpen((prev: boolean) => !prev)}>
            <span>数据表</span>
            <span>{dataTablePanelOpen ? "▾" : "▸"}</span>
          </button>
          {dataTablePanelOpen ? (
            <div className="table-wrap">
              <table className="radar-data-table">
                <colgroup>
                  <col className="col-metric" />
                  <col className="col-group" />
                  <col className="col-value" />
                  <col className="col-per90" />
                  <col className="col-tier" />
                  <col className="col-order" />
                  <col className="col-suborder" />
                  <col className="col-up" />
                  <col className="col-down" />
                  <col className="col-delete" />
                </colgroup>
                <thead>
                  <tr>
                    <th>metric*</th>
                    <th>group*</th>
                    <th>value*</th>
                    <th>per90</th>
                    <th>tier(自动)</th>
                    <th>order*</th>
                    <th>组内顺序</th>
                    <th>上移</th>
                    <th>下移</th>
                    <th>删除</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any, index: number) => (
                    <tr key={index}>
                      <td><input value={row.metric} onChange={(e) => updateCell(index, "metric", e.target.value)} /></td>
                      <td><input value={row.group} onChange={(e) => updateCell(index, "group", e.target.value)} /></td>
                      <td><input type="number" max="100" step="0.01" value={row.value} onChange={(e) => updateCell(index, "value", e.target.value)} /></td>
                      <td><input value={row.per90} onChange={(e) => updateCell(index, "per90", e.target.value)} /></td>
                      <td><input value={`${TIER_LABELS[row.tier] || "中等"} (${row.tier || "avg"})`} readOnly /></td>
                      <td><input type="number" step="1" value={row.order} onChange={(e) => updateCell(index, "order", e.target.value)} /></td>
                      <td><input type="number" step="1" value={row.subOrder} onChange={(e) => updateCell(index, "subOrder", e.target.value)} /></td>
                      <td><button type="button" className="move-btn" onClick={() => moveRow(index, -1)} disabled={index === 0}>上移</button></td>
                      <td><button type="button" className="move-btn" onClick={() => moveRow(index, 1)} disabled={index === rows.length - 1}>下移</button></td>
                      <td><button className="danger" onClick={() => removeRow(index)}>删除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      <div className="right-panel">
        <div className="right-sticky">
          <svg id="radar-svg" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} style={{ backgroundColor: chartStyle.backgroundColor || "#f8f5ef" }}>
            <defs>
              <clipPath id="center-image-clip">
                <circle cx={CENTER_X} cy={CENTER_Y} r={INNER_RING - 2} />
              </clipPath>
            </defs>
            <rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={chartStyle.backgroundColor || "#f8f5ef"} />

            {cornerImage.src ? <image href={cornerImage.src} x={cornerImage.x} y={cornerImage.y} width={cornerImage.size} height={cornerImage.size} preserveAspectRatio="xMidYMid meet" /> : null}

            {[20, 40, 60, 80, 100].map((pct) => {
              const radius = INNER_RING + (pct / 100) * MAX_RADIAL_LENGTH;
              return (
                <g key={pct}>
                  <circle cx={CENTER_X} cy={CENTER_Y} r={radius} fill="none" stroke="#d0cdc6" strokeWidth={chartStyle.ringStrokeWidth} strokeDasharray={chartStyle.ringLineStyle === "dashed" ? chartStyle.ringDasharray : "none"} />
                  <text x={CENTER_X + 8} y={CENTER_Y - radius + 16} fill="#9a9389" fontSize={textStyle.tickSize} fontFamily={textStyle.fontFamily}>
                    {pct}
                  </text>
                </g>
              );
            })}

            <circle cx={CENTER_X} cy={CENTER_Y} r={INNER_RING} fill={chartStyle.backgroundColor || "#f8f5ef"} stroke="none" />

            {centerImage.src ? (
              <image
                href={centerImage.src}
                x={CENTER_X - (INNER_RING * 2 * centerImage.scale) / 2}
                y={CENTER_Y - (INNER_RING * 2 * centerImage.scale) / 2}
                width={INNER_RING * 2 * centerImage.scale}
                height={INNER_RING * 2 * centerImage.scale}
                preserveAspectRatio="xMidYMid meet"
                clipPath="url(#center-image-clip)"
              />
            ) : null}

            <circle cx={CENTER_X} cy={CENTER_Y} r={INNER_RING} fill="none" stroke="#a89f94" strokeWidth={chartStyle.innerRingStrokeWidth} />

            {sortedRows.map((row: any, i: number) => {
              const angle = stats.startAngle + i * stats.step;
              const a0 = angle - stats.barWidth / 2;
              const a1 = angle + stats.barWidth / 2;
              const barInnerRadius = INNER_RING + BAR_INNER_GAP;
              const barSpan = MAX_RADIAL_LENGTH - BAR_INNER_GAP;
              const endRadius = barInnerRadius + (Number(row.value) / 100) * barSpan;
              const color = row.color?.trim() || DEFAULT_TIER_COLORS[row.tier] || DEFAULT_TIER_COLORS.avg;
              const barPath = annularSectorPath(a0, a1, barInnerRadius, endRadius);

              const tx = CENTER_X + METRIC_LABEL_RADIUS * Math.cos(angle);
              const ty = CENTER_Y + METRIC_LABEL_RADIUS * Math.sin(angle);
              const per90Inner = INNER_RING + 10;
              const per90Outer = INNER_RING + 36;
              const per90A0 = angle - stats.barWidth * 0.28;
              const per90A1 = angle + stats.barWidth * 0.28;
              const per90Path = annularSectorPath(per90A0, per90A1, per90Inner, per90Outer);
              const per90Center = polarPoint((per90Inner + per90Outer) / 2, angle);

              return (
                <g key={`${row.metric}-${i}`}>
                  <path d={barPath} fill={colorToAlpha(color)} stroke={color} strokeWidth="2" />
                  <text x={tx} y={ty} fill={color} fontSize={textStyle.metricSize} fontFamily={textStyle.fontFamily} textAnchor="middle">
                    {row.metric}
                  </text>
                  {row.per90 ? (
                    <g>
                      <path d={per90Path} fill={color} stroke="none" />
                      <text x={per90Center.x} y={per90Center.y + 4} fill="#fff" fontSize={textStyle.per90Size} fontFamily={textStyle.fontFamily} textAnchor="middle">
                        {row.per90}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}

            {groupLabelLayouts.map((item: any) => (
              <g key={item.key}>
                <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke="#c1bbb2" strokeWidth={chartStyle.groupSeparatorWidth} />
                <text x={item.gx} y={item.gy} fill="#6f675d" fontSize={textStyle.groupSize} fontFamily={textStyle.fontFamily} fontWeight="700" textAnchor="middle">
                  {item.group}
                </text>
              </g>
            ))}

            <text x={CENTER_X} y="58" textAnchor="middle" fontSize={textStyle.titleSize} fontFamily={textStyle.fontFamily} fontWeight="700" fill="#2f2a24">
              {title}
            </text>
            <text x={CENTER_X} y="98" textAnchor="middle" fontSize={textStyle.subtitleSize} fontFamily={textStyle.fontFamily} fill="#5f5850">
              {subtitle}
            </text>

            <text x="980" y="1125" fill={DEFAULT_TIER_COLORS.elite} fontSize={textStyle.legendSize} fontFamily={textStyle.fontFamily}>顶级（前10%）</text>
            <text x="980" y="1150" fill={DEFAULT_TIER_COLORS.above_avg} fontSize={textStyle.legendSize} fontFamily={textStyle.fontFamily}>高于平均（11%-35%）</text>
            <text x="980" y="1175" fill={DEFAULT_TIER_COLORS.avg} fontSize={textStyle.legendSize} fontFamily={textStyle.fontFamily}>平均（36%-66%）</text>
            <text x="980" y="1200" fill={DEFAULT_TIER_COLORS.bottom} fontSize={textStyle.legendSize} fontFamily={textStyle.fontFamily}>低于平均（后35%）</text>
          </svg>
        </div>
      </div>
    </div>
  );
}

export default RadarEditorPage;
