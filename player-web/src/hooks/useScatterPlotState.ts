import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPlayerDataset } from "../api/storageClient";

export const DEFAULT_SCATTER_CONFIG = {
  xCol: "",
  yCol: "",
  xAxisLabel: "",
  yAxisLabel: "",
  searchQuery: "",
  xMin: "",
  xMax: "",
  yMin: "",
  yMax: "",
  selectedPlayerId: "",
  axisLabelFontSize: 13,
  axisLabelFontWeight: "500",
  axisLabelColor: "#4f453b",
  avgLineColor: "#d97706",
  avgLineWidth: 1.6,
  showPointPlayerNames: false
};

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useScatterPlotState({
  activePage,
  selectedDatasetId,
  loadDatasets,
  isHydrated,
  readStorage,
  writeStorage,
  storageKey
}) {
  const [scatterConfigByDataset, setScatterConfigByDataset] = useState(() => asObject(readStorage(storageKey, {})));
  const [scatterDataLoading, setScatterDataLoading] = useState(false);
  const [scatterDataError, setScatterDataError] = useState("");
  const [scatterDatasetDoc, setScatterDatasetDoc] = useState(null);
  const scatterReqSeqRef = useRef(0);

  const scatterConfig = useMemo(() => {
    if (!selectedDatasetId) return DEFAULT_SCATTER_CONFIG;
    const custom = scatterConfigByDataset[selectedDatasetId];
    if (!custom || typeof custom !== "object") return DEFAULT_SCATTER_CONFIG;
    return { ...DEFAULT_SCATTER_CONFIG, ...custom };
  }, [selectedDatasetId, scatterConfigByDataset]);

  const updateScatterConfig = (patch) => {
    if (!selectedDatasetId) return;
    setScatterConfigByDataset((prev) => {
      const current = prev[selectedDatasetId] && typeof prev[selectedDatasetId] === "object"
        ? prev[selectedDatasetId]
        : DEFAULT_SCATTER_CONFIG;
      return {
        ...prev,
        [selectedDatasetId]: { ...DEFAULT_SCATTER_CONFIG, ...current, ...patch }
      };
    });
  };

  useEffect(() => {
    if (!isHydrated) return;
    writeStorage(storageKey, scatterConfigByDataset);
  }, [scatterConfigByDataset, isHydrated, storageKey, writeStorage]);

  useEffect(() => {
    const hydrateScatterPage = async () => {
      if (activePage !== "scatter_plot") return;
      await loadDatasets(selectedDatasetId);
    };
    hydrateScatterPage();
  }, [activePage, selectedDatasetId]);

  useEffect(() => {
    const loadScatterDataset = async () => {
      if (activePage !== "scatter_plot") return;
      if (!selectedDatasetId) {
        setScatterDatasetDoc(null);
        setScatterDataError("");
        setScatterDataLoading(false);
        return;
      }
      const seq = scatterReqSeqRef.current + 1;
      scatterReqSeqRef.current = seq;
      setScatterDataLoading(true);
      setScatterDataError("");
      try {
        const res = await fetchPlayerDataset(selectedDatasetId);
        if (scatterReqSeqRef.current !== seq) return;
        setScatterDatasetDoc(res?.data || null);
      } catch (err) {
        if (scatterReqSeqRef.current !== seq) return;
        setScatterDatasetDoc(null);
        setScatterDataError(`散点图数据读取失败：${err.message}`);
      } finally {
        if (scatterReqSeqRef.current === seq) {
          setScatterDataLoading(false);
        }
      }
    };
    loadScatterDataset();
  }, [activePage, selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId) return;
    const numericColumns = Array.isArray(scatterDatasetDoc?.schema?.numericColumns) ? scatterDatasetDoc.schema.numericColumns : [];
    setScatterConfigByDataset((prev) => {
      const current = prev[selectedDatasetId] && typeof prev[selectedDatasetId] === "object"
        ? { ...DEFAULT_SCATTER_CONFIG, ...prev[selectedDatasetId] }
        : { ...DEFAULT_SCATTER_CONFIG };
      const next = { ...current };
      if (next.xCol && !numericColumns.includes(next.xCol)) next.xCol = "";
      if (next.yCol && !numericColumns.includes(next.yCol)) next.yCol = "";
      const selectedExists = Array.isArray(scatterDatasetDoc?.players)
        ? scatterDatasetDoc.players.some((player) => String(player?.id || "") === String(next.selectedPlayerId || ""))
        : false;
      if (!selectedExists) next.selectedPlayerId = "";
      const unchanged = Object.keys(DEFAULT_SCATTER_CONFIG).every((key) => current[key] === next[key]);
      if (unchanged) return prev;
      return { ...prev, [selectedDatasetId]: next };
    });
  }, [selectedDatasetId, scatterDatasetDoc]);

  return {
    scatterConfig,
    updateScatterConfig,
    scatterDataLoading,
    scatterDataError,
    scatterDatasetDoc
  };
}
