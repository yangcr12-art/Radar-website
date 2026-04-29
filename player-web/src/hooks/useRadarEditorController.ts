import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeTierFromValue,
  formatRadarTitlePlayerName,
  normalizeExportSequenceMap,
  normalizeSnapshot,
  parseCsv,
  recomputeRowsTier,
  resequenceSubOrder,
  sanitizeExportFilenamePart
} from "../app/radar/radarState";
import {
  CENTER_X,
  CENTER_Y,
  DEFAULT_CENTER_IMAGE,
  DEFAULT_CHART_STYLE,
  DEFAULT_CORNER_IMAGE,
  DEFAULT_META,
  DEFAULT_TEXT_STYLE,
  INITIAL_ROWS,
  INNER_RING,
  MAX_RADIAL_LENGTH,
  METRIC_LABEL_RADIUS,
  REORDER_MODE_ORDER,
  STORAGE_KEYS
} from "../app/constants";
import { computeGroupLabelLayouts } from "../utils/radarLabelLayout";
import { compactPresetsForLocalStorage, compactSnapshotForLocalStorage, isQuotaExceededResult } from "../utils/localStorageQuota";

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function useRadarEditorController({
  readStorage,
  writeStorage,
  writeStorageWithResult,
  toCsv,
  isHydrated,
  resolveSelectedPlayerName
}: {
  readStorage: any;
  writeStorage: any;
  writeStorageWithResult: any;
  toCsv: any;
  isHydrated: boolean;
  resolveSelectedPlayerName: () => string;
}) {
  const [title, setTitle] = useState("Player Radar (Template Mode)");
  const [subtitle, setSubtitle] = useState("Input metric CSV and export image");
  const [rows, setRows] = useState(() => recomputeRowsTier(INITIAL_ROWS));
  const [rowReorderMode, setRowReorderMode] = useState(REORDER_MODE_ORDER);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(DEFAULT_META);
  const [textStyle, setTextStyle] = useState(DEFAULT_TEXT_STYLE);
  const [chartStyle, setChartStyle] = useState(DEFAULT_CHART_STYLE);
  const [centerImage, setCenterImage] = useState(DEFAULT_CENTER_IMAGE);
  const [cornerImage, setCornerImage] = useState(DEFAULT_CORNER_IMAGE);
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState("draft");
  const [saveName, setSaveName] = useState("");
  const [titlePanelOpen, setTitlePanelOpen] = useState(true);
  const [fontPanelOpen, setFontPanelOpen] = useState(true);
  const [imagePanelOpen, setImagePanelOpen] = useState(true);
  const [dataTablePanelOpen, setDataTablePanelOpen] = useState(true);
  const [radarPngExportSequenceByVersion, setRadarPngExportSequenceByVersion] = useState(() => {
    const raw = readStorage(STORAGE_KEYS.radarPngExportSequenceByVersion, {});
    return normalizeExportSequenceMap(raw);
  });
  const fileInputRef = useRef<any>(null);
  const centerImageInputRef = useRef<any>(null);
  const cornerImageInputRef = useRef<any>(null);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (Number(a.order) !== Number(b.order)) return Number(a.order) - Number(b.order);
      if (a.group !== b.group) return a.group.localeCompare(b.group, "en-US");
      if (Number(a.subOrder) !== Number(b.subOrder)) return Number(a.subOrder) - Number(b.subOrder);
      return a.metric.localeCompare(b.metric, "en-US");
    });
  }, [rows]);

  const stats = useMemo(() => {
    const total = sortedRows.length || 1;
    const step = (Math.PI * 2) / total;
    const barWidth = step * 0.92;
    const startAngle = -Math.PI / 2;
    const groupStarts: Array<{ index: number; group: string }> = [];
    let lastGroup = "";
    sortedRows.forEach((row, index) => {
      if (row.group !== lastGroup) {
        groupStarts.push({ index, group: row.group });
        lastGroup = row.group;
      }
    });
    return { total, step, barWidth, startAngle, groupStarts };
  }, [sortedRows]);

  const groupLabelLayouts = useMemo(() => {
    return computeGroupLabelLayouts({
      sortedRows,
      stats,
      textStyle,
      chartStyle,
      centerX: CENTER_X,
      centerY: CENTER_Y,
      innerRing: INNER_RING,
      maxRadialLength: MAX_RADIAL_LENGTH,
      metricLabelRadius: METRIC_LABEL_RADIUS
    });
  }, [
    sortedRows,
    stats,
    textStyle.metricSize,
    textStyle.groupSize,
    textStyle.fontFamily,
    chartStyle.groupSeparatorLength,
    chartStyle.groupSeparatorOffset,
    chartStyle.groupLabelRadius,
    chartStyle.groupLabelOffsetX,
    chartStyle.groupLabelOffsetY
  ]);

  const updateCell = (index: number, field: string, value: unknown) => {
    setRows((prev) => {
      const next = [...prev];
      const cloned = { ...next[index] };
      if (field === "value") {
        const num = Number(value);
        cloned[field] = Number.isNaN(num) ? 0 : Math.min(100, num);
        cloned.tier = computeTierFromValue(cloned[field]);
      } else if (field === "order") {
        const num = Number(value);
        cloned[field] = Number.isNaN(num) ? 1 : Math.floor(num);
      } else if (field === "subOrder") {
        const num = Number(value);
        cloned[field] = Number.isNaN(num) ? 1 : Math.max(1, Math.floor(num));
      } else {
        cloned[field] = value;
      }
      next[index] = cloned;
      return next;
    });
    setError("");
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { metric: "new_metric", group: "new_group", value: 50, per90: "", tier: computeTierFromValue(50), order: 1, subOrder: 1, color: "" }
    ]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const moveRow = (index: number, direction: number) => {
    setRows((prev) => {
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      let next = rowReorderMode === REORDER_MODE_ORDER ? prev.map((row) => ({ ...row })) : [...prev];

      if (rowReorderMode === REORDER_MODE_ORDER) {
        const sourceOrder = Number(next[index].order);
        const targetOrder = Number(next[target].order);
        if (!Number.isFinite(sourceOrder) || !Number.isFinite(targetOrder)) {
          next = next.map((row, i) => ({ ...row, order: i + 1 }));
        }
        const normalizedSourceOrder = Math.floor(Number(next[index].order));
        const normalizedTargetOrder = Math.floor(Number(next[target].order));
        next[index].order = normalizedTargetOrder;
        next[target].order = normalizedSourceOrder;
      }

      [next[index], next[target]] = [next[target], next[index]];
      return resequenceSubOrder(next);
    });
    setError("");
  };

  const downloadCsv = () => {
    downloadFile("player_chart_data.csv", toCsv(rows), "text/csv;charset=utf-8");
    setMessage("已下载当前数据 CSV");
    setError("");
  };

  const importCsvText = (csvText: string) => {
    const parsed = parseCsv(csvText);
    if (parsed.error) {
      setError(parsed.error);
      setMessage("");
      return;
    }
    setRows(recomputeRowsTier(parsed.rows));
    setMessage(`CSV 导入成功，共 ${parsed.rows.length} 行`);
    setError("");
  };

  const onUploadClick = () => fileInputRef.current?.click();

  const onCsvFileChange = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importCsvText(text);
    event.target.value = "";
  };

  const updateMeta = (field: string, value: string) => {
    setMeta((prev) => ({ ...prev, [field]: value }));
  };

  const updateTextStyle = (field: string, value: unknown) => {
    if (field === "fontFamily") {
      setTextStyle((prev) => ({ ...prev, fontFamily: value }));
      return;
    }
    const num = Number(value);
    const safe = Number.isFinite(num) ? Math.min(48, Math.floor(num)) : 12;
    setTextStyle((prev) => ({ ...prev, [field]: safe }));
  };

  const updateChartStyle = (field: string, value: unknown) => {
    if (field === "ringLineStyle" || field === "ringDasharray" || field === "backgroundColor") {
      setChartStyle((prev) => ({ ...prev, [field]: value }));
      return;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const safe =
      field === "ringStrokeWidth" || field === "innerRingStrokeWidth" || field === "groupSeparatorWidth"
        ? Math.min(8, Number(num.toFixed(1)))
        : Number(num.toFixed(1));
    setChartStyle((prev) => ({ ...prev, [field]: safe }));
  };

  const getSnapshot = () => ({
    title,
    subtitle,
    rows,
    rowReorderMode,
    meta,
    textStyle,
    chartStyle,
    centerImage,
    cornerImage
  });

  const applySnapshot = (snapshot: any) => {
    const normalized = normalizeSnapshot(snapshot);
    setTitle(normalized.title);
    setSubtitle(normalized.subtitle);
    setRows(normalized.rows);
    setRowReorderMode(normalized.rowReorderMode);
    setMeta(normalized.meta);
    setTextStyle(normalized.textStyle);
    setChartStyle(normalized.chartStyle);
    setCenterImage(normalized.centerImage);
    setCornerImage(normalized.cornerImage);
  };

  const handleSavePreset = () => {
    const name = saveName.trim();
    if (!name) {
      setError("请输入版本名称。");
      setMessage("");
      return;
    }
    const newPreset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      updatedAt: new Date().toISOString(),
      payload: getSnapshot()
    };
    setPresets((prev) => [newPreset, ...prev]);
    setSelectedPresetId(newPreset.id);
    setSaveName("");
    setMessage(`已保存版本：${name}（含数据+图表样式）`);
    setError("");
  };

  const handleSwitchPreset = (targetId: string) => {
    writeStorage(STORAGE_KEYS.draft, getSnapshot());
    if (targetId === "draft") {
      const draft = readStorage(STORAGE_KEYS.draft, null);
      if (draft) applySnapshot(draft);
      setSelectedPresetId("draft");
      setMessage("已切换到当前草稿");
      setError("");
      return;
    }
    const found = presets.find((item: any) => item.id === targetId);
    if (!found) {
      setError("未找到该版本。");
      setMessage("");
      return;
    }
    applySnapshot(found.payload);
    setSelectedPresetId(targetId);
    setMessage(`已切换到版本：${found.name}（已载入数据+图表样式）`);
    setError("");
  };

  const handleDeletePreset = () => {
    if (selectedPresetId === "draft") {
      setError("当前草稿不能删除。");
      setMessage("");
      return;
    }
    const found = presets.find((item: any) => item.id === selectedPresetId);
    setPresets((prev) => prev.filter((item: any) => item.id !== selectedPresetId));
    setSelectedPresetId("draft");
    setMessage(found ? `已删除版本：${found.name}` : "已删除版本");
    setError("");
  };

  const applyTitleTemplate = () => {
    const effectivePlayerName = String(meta.player || "").trim() || String(resolveSelectedPlayerName() || "").trim();
    const titlePlayerName = formatRadarTitlePlayerName(effectivePlayerName, meta.playerZh);
    setTitle(`${titlePlayerName} (${meta.age}, ${meta.position}, ${meta.minutes} mins.), ${meta.club}`);
    setSubtitle(`${meta.season} ${meta.league} Percentile Rankings & Per 90 Values`);
    setMessage("已应用标题模板");
    setError("");
  };

  const onCenterImageClick = () => centerImageInputRef.current?.click();
  const onCornerImageClick = () => cornerImageInputRef.current?.click();

  const handleImageSelection = (event: any, onLoaded: (src: string) => void) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("仅支持 PNG / JPG / WEBP 图片。");
      setMessage("");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("图片请控制在 2MB 以内。");
      setMessage("");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      onLoaded(src);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const onCenterImageChange = (event: any) => {
    handleImageSelection(event, (src) => {
      setCenterImage((prev) => ({ ...prev, src, scale: prev.scale || 1 }));
      setMessage("中心图片已更新。");
      setError("");
    });
  };

  const updateCenterImageScale = (value: unknown) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const scale = Math.max(0.5, Math.min(2.5, Number(num.toFixed(2))));
    setCenterImage((prev) => ({ ...prev, scale }));
  };

  const clearCenterImage = () => {
    setCenterImage(DEFAULT_CENTER_IMAGE);
    setMessage("已清除中心图片。");
    setError("");
  };

  const onCornerImageChange = (event: any) => {
    handleImageSelection(event, (src) => {
      setCornerImage({ ...DEFAULT_CORNER_IMAGE, src });
      setMessage("左上角图片已更新。");
      setError("");
    });
  };

  const updateCornerImage = (field: string, value: unknown) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    if (field === "size") {
      setCornerImage((prev) => ({ ...prev, size: Number(num.toFixed(1)) }));
      return;
    }
    setCornerImage((prev) => ({ ...prev, [field]: Number(num.toFixed(1)) }));
  };

  const clearCornerImage = () => {
    setCornerImage(DEFAULT_CORNER_IMAGE);
    setMessage("已清除左上角图片。");
    setError("");
  };

  const exportSvg = () => {
    const svg = document.getElementById("radar-svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    downloadFile("player_radar.svg", serializer.serializeToString(svg), "image/svg+xml;charset=utf-8");
  };

  const exportPng = () => {
    const svg = document.getElementById("radar-svg");
    if (!svg) return;
    const currentPreset = selectedPresetId === "draft" ? null : presets.find((item: any) => item.id === selectedPresetId);
    const versionLabel = sanitizeExportFilenamePart(currentPreset?.name || saveName || "当前草稿");
    const sequenceKey = currentPreset?.id || `draft:${versionLabel}`;
    const nextSequence = (radarPngExportSequenceByVersion[sequenceKey] || 0) + 1;
    const exportFilename = `${versionLabel}${String(nextSequence).padStart(2, "0")}.png`;
    const serializer = new XMLSerializer();
    const text = serializer.serializeToString(svg);
    const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1600;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = chartStyle.backgroundColor || "#f8f5ef";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = exportFilename;
      a.click();
      setRadarPngExportSequenceByVersion((prev) => ({ ...prev, [sequenceKey]: nextSequence }));
      setMessage(`已导出 PNG：${exportFilename}`);
      setError("");
    };
    image.src = url;
  };

  useEffect(() => {
    if (!isHydrated) return;
    const snapshot = getSnapshot();
    const writes = [
      { label: "draft", key: STORAGE_KEYS.draft, value: snapshot },
      { label: "selectedPresetId", key: STORAGE_KEYS.selectedPresetId, value: selectedPresetId },
      { label: "presets", key: STORAGE_KEYS.presets, value: presets }
    ];
    const failed: any[] = [];
    for (const item of writes) {
      let result = writeStorageWithResult(item.key, item.value);
      if (!result.ok && isQuotaExceededResult(result)) {
        if (item.label === "draft") {
          result = writeStorageWithResult(item.key, compactSnapshotForLocalStorage(snapshot));
        } else if (item.label === "presets") {
          result = writeStorageWithResult(item.key, compactPresetsForLocalStorage(presets));
        }
      }
      if (!result.ok) failed.push({ ...item, result });
    }
    if (failed.length > 0) {
      const detail = failed.map((item) => `${item.label}(${item.result.error})`).join("; ");
      setError(`本地缓存写入失败：${detail}`);
    } else {
      setError((prev) => (prev.startsWith("本地缓存写入失败：") ? "" : prev));
    }
  }, [title, subtitle, rows, rowReorderMode, meta, textStyle, chartStyle, centerImage, cornerImage, selectedPresetId, presets, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    writeStorage(STORAGE_KEYS.radarPngExportSequenceByVersion, radarPngExportSequenceByVersion);
  }, [radarPngExportSequenceByVersion, isHydrated, writeStorage]);

  useEffect(() => {
    if (!isHydrated) return;
    if (selectedPresetId === "draft") return;
    setPresets((prev) =>
      prev.map((item: any) =>
        item.id === selectedPresetId ? { ...item, payload: getSnapshot(), updatedAt: new Date().toISOString() } : item
      )
    );
  }, [title, subtitle, rows, rowReorderMode, meta, textStyle, chartStyle, centerImage, cornerImage, selectedPresetId, isHydrated]);

  return {
    title,
    setTitle,
    subtitle,
    setSubtitle,
    rows,
    setRows,
    rowReorderMode,
    setRowReorderMode,
    message,
    setMessage,
    error,
    setError,
    meta,
    setMeta,
    textStyle,
    setTextStyle,
    chartStyle,
    setChartStyle,
    centerImage,
    setCenterImage,
    cornerImage,
    setCornerImage,
    presets,
    setPresets,
    selectedPresetId,
    setSelectedPresetId,
    saveName,
    setSaveName,
    titlePanelOpen,
    setTitlePanelOpen,
    fontPanelOpen,
    setFontPanelOpen,
    imagePanelOpen,
    setImagePanelOpen,
    dataTablePanelOpen,
    setDataTablePanelOpen,
    radarPngExportSequenceByVersion,
    setRadarPngExportSequenceByVersion,
    fileInputRef,
    centerImageInputRef,
    cornerImageInputRef,
    sortedRows,
    stats,
    groupLabelLayouts,
    updateCell,
    addRow,
    removeRow,
    moveRow,
    downloadCsv,
    onUploadClick,
    onCsvFileChange,
    updateMeta,
    updateTextStyle,
    updateChartStyle,
    getSnapshot,
    applySnapshot,
    handleSavePreset,
    handleSwitchPreset,
    handleDeletePreset,
    applyTitleTemplate,
    onCenterImageClick,
    clearCenterImage,
    onCenterImageChange,
    updateCenterImageScale,
    onCornerImageClick,
    clearCornerImage,
    onCornerImageChange,
    updateCornerImage,
    exportSvg,
    exportPng
  };
}

export default useRadarEditorController;
