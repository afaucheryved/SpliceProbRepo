import { h, useEffect, useMemo, useRef, useState, useCallback } from "../../lib/preact.js";
import ChartJS from "https://esm.sh/chart.js@4.4.4/auto";
import zoomPlugin from "https://esm.sh/chartjs-plugin-zoom@2?deps=chart.js@4.4.4";
import { Popover } from "./Popover.js";
import { resolveNearestBarIndex, buildPositionValueMap, buildPopoverScores, computeYAxisExtent, aggregateBarSeries, findLocalMaxima, findNearestPeakByPercent } from "../../lib/chartLogic.js";
import { getTheme, seriesColors } from "../../lib/theme.js";

const verticalMarkerPlugin = {
  id: "verticalMarker",
  afterDraw(chart) {
    const position = chart.$verticalMarkerPosition;
    if (position == null) return;
    const idx = chart.data.labels.indexOf(position);
    if (idx === -1) return;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (!xScale || !yScale) return;
    const x = xScale.getPixelForValue(idx);
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = seriesColors(getTheme()).markerLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, yScale.top);
    ctx.lineTo(x, yScale.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

// Draws a dashed vertical line at the peak-hover-snapped position, plus a
// small floating pill showing the dataset label and value. Reads its target
// off chart.$peakHover (set by the mousemove handler on the wrapper div).
const peakHoverPlugin = {
  id: "peakHover",
  afterDraw(chart) {
    const hover = chart.$peakHover;
    if (!hover) return;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (!xScale || !yScale) return;

    const peakPx = xScale.getPixelForValue(hover.index);
    if (peakPx == null) return;
    const chartArea = chart.chartArea;
    if (peakPx < chartArea.left || peakPx > chartArea.right) return;

    const ctx = chart.ctx;
    const colors = seriesColors(getTheme());
    const ds = chart.data.datasets[hover.datasetIndex];
    const dsColor = ds?.borderColor || ds?.backgroundColor || colors.markerLine;

    ctx.save();

    // Dashed vertical marker at the snapped peak
    ctx.strokeStyle = dsColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(peakPx, chartArea.top);
    ctx.lineTo(peakPx, chartArea.bottom);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const label = ds?.label || "";
    const displayValue = hover.value != null ? (Math.abs(hover.value) < 0.001 ? hover.value.toExponential(2) : hover.value.toFixed(4)) : "";
    const text = label ? `${label}: ${displayValue}` : displayValue;

    ctx.font = "bold 11px sans-serif";
    const textWidth = ctx.measureText(text).width;
    const pillW = textWidth + 14;
    const pillH = 22;
    let pillX = peakPx + 8;
    let pillY = chartArea.top + 4;

    if (pillX + pillW > chartArea.right - 4) pillX = peakPx - pillW - 8;
    if (pillX < chartArea.left + 4) pillX = chartArea.left + 4;

    const style = getComputedStyle(document.documentElement);
    const panelBg = style.getPropertyValue("--app-panel").trim() || "#161a22";
    const fg = style.getPropertyValue("--app-fg").trim() || "#e5e7eb";

    ctx.fillStyle = panelBg + "ee";
    ctx.strokeStyle = dsColor;
    ctx.lineWidth = 1;
    roundRect(ctx, pillX, pillY, pillW, pillH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(text, pillX + 7, pillY + pillH / 2);

    ctx.restore();
  },
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

ChartJS.register(zoomPlugin, verticalMarkerPlugin, peakHoverPlugin);

// Thin Chart.js wrapper shared by every probability/delta/scatter view.
// Owns the <canvas>, the Chart.js instance lifecycle, the zoom plugin, and
// drawing concerns only -- click-resolution, popover-content assembly, bar
// aggregation and y-axis extents all live in lib/chartLogic.js and are only
// *called* from here (see that file for the split's rationale).
//
// `type` follows Chart.js chart types: 'line' | 'bar' | 'scatter' | ...
//
// When `sequence` is provided, clicking a data point opens a popup showing:
//   - Position (1-based)
//   - Score for each dataset at that point (plus any `companionDatasets`)
//   - ±10 bases of sequence context around the clicked position
// and drops a vertical marker line at that position until a new click or the
// popup is closed.
//
// `companionDatasets`: optional `[{ label, positions, values }]` -- raw
// flattened series (e.g. from flattenProbaTrack) belonging to a *sibling*
// Chart instance, merged into the popover's score list by real sequence
// position so a click on either of two related charts (item 7a) shows both.
export function Chart({ type = "line", labels = [], datasets = [], height = 260, options = {}, sequence, companionDatasets = [] }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const [popover, setPopover] = useState(null);

  const companionMaps = useMemo(
    () => (companionDatasets || []).map((c) => ({ label: c.label, map: buildPositionValueMap(c.positions, c.values) })),
    [companionDatasets]
  );
  const companionMapsRef = useRef(companionMaps);
  useEffect(() => {
    companionMapsRef.current = companionMaps;
  }, [companionMaps]);

  // Pre-compute peaks once when dataset data changes, not on every
  // mousemove. Only for line/scatter charts — bar charts are already
  // handled by aggregateBarSeries compression (chartLogic.js) so the
  // visible bar count is always ≤ ~500 and native nearest-bar works fine.
  const datasetPeaks = useMemo(() => {
    if (type === "bar") return [];
    return datasets.map((ds) => findLocalMaxima(ds.data || []));
  }, [datasets, type]);

  const handleMouseMove = useCallback((e) => {
    if (type === "bar") return;
    const chart = chartRef.current;
    if (!chart) return;

    const rect = chart.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const chartArea = chart.chartArea;
    const xScale = chart.scales.x;
    if (!chartArea || !xScale) return;

    let bestPeak = null;
    let bestDist = Infinity;
    for (let di = 0; di < datasetPeaks.length; di++) {
      const peak = findNearestPeakByPercent(datasetPeaks[di], xScale, mouseX, chartArea);
      if (peak) {
        const peakPx = xScale.getPixelForValue(peak.index);
        const dist = Math.abs(peakPx - mouseX);
        if (dist < bestDist) {
          bestDist = dist;
          bestPeak = { ...peak, datasetIndex: di };
        }
      }
    }

    if (bestPeak) {
      chart.$peakHover = bestPeak;
    } else {
      chart.$peakHover = null;
    }
    chart.draw("none");
  }, [datasetPeaks, type]);

  const handleMouseLeave = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.$peakHover = null;
    chart.draw("none");
  }, []);

  function shapeData(rawLabels, rawDatasets) {
    if (type === "bar") {
      const { labels: shapedLabels, datasets: shapedDatasets } = aggregateBarSeries({ labels: rawLabels, datasets: rawDatasets });
      return { shapedLabels, shapedDatasets, yExtent: computeYAxisExtent(shapedDatasets, { allowNegativeMin: true }) };
    }
    return { shapedLabels: rawLabels, shapedDatasets: rawDatasets, yExtent: computeYAxisExtent(rawDatasets) };
  }

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    const userOnClick = options.onClick;
    const { shapedLabels, shapedDatasets, yExtent } = shapeData(labels, datasets);

    const mergedOptions = {
      ...options,
      scales: {
        ...options.scales,
        y: { ...options.scales?.y, ...yExtent },
      },
      plugins: {
        ...options.plugins,
        legend: {
          ...options.plugins?.legend,
          labels: {
            ...options.plugins?.legend?.labels,
            filter: (item, data) => !data.datasets[item.datasetIndex]?._aggregatedGap,
          },
        },
        tooltip: {
          // Disable Chart.js's native tooltip — peakHoverPlugin renders our
          // custom pill instead, which snaps to local maxima.
          enabled: false,
        },
        zoom: {
          pan: { enabled: true, mode: "x" },
          zoom: {
            wheel: { enabled: true, modifierKey: "ctrl" },
            pinch: { enabled: true },
            drag: { enabled: false },
            mode: "x",
          },
        },
      },
      // Keep Chart.js's native interaction for the click handler (it
      // resolves the nearest raw data point), but we bypass the tooltip
      // rendering so peakHoverPlugin handles the visual hover instead.
      interaction: { mode: "x", intersect: false },
      onClick: (evt, elements, chart) => {
        if (userOnClick) userOnClick(evt, elements, chart);
        if (!sequence) return;

        let index;
        let datasetIndex;
        let point;

        if (type === "bar") {
          if (!elements.length) return;
          index = resolveNearestBarIndex({ chart, datasetIndex: elements[0].datasetIndex, fallbackIndex: elements[0].index, clickX: evt.x });
          datasetIndex = elements[0].datasetIndex;
          point = chart.getDatasetMeta(datasetIndex).data[index];
        } else {
          // Line/scatter: snap click to the nearest peak using the same
          // magnitude-weighted logic as hover, with a slightly wider 12%
          // radius so clicking near-but-not-on a peak still snaps to it.
          // Falls back to the native nearest raw point when no peak is close.
          const mouseX = evt.x;
          const chartArea = chart.chartArea;
          const xScale = chart.scales.x;
          let bestPeak = null;
          let bestScore = Infinity;
          if (xScale && chartArea) {
            for (let di = 0; di < datasetPeaks.length; di++) {
              const peak = findNearestPeakByPercent(datasetPeaks[di], xScale, mouseX, chartArea, 0.12);
              if (peak) {
                const peakPx = xScale.getPixelForValue(peak.index);
                const dist = Math.abs(peakPx - mouseX);
                const magnitude = Math.abs(peak.value);
                const score = dist / (magnitude + 1e-12);
                if (score < bestScore) {
                  bestScore = score;
                  bestPeak = { ...peak, datasetIndex: di };
                }
              }
            }
          }

          if (bestPeak) {
            index = bestPeak.index;
            datasetIndex = bestPeak.datasetIndex;
            point = chart.getDatasetMeta(datasetIndex).data[index];
          } else if (elements.length) {
            index = elements[0].index;
            datasetIndex = elements[0].datasetIndex;
            point = chart.getDatasetMeta(datasetIndex).data[index];
          } else {
            return;
          }
        }

        const rawLabel = chart.data.labels[index];
        const position = typeof rawLabel === "number" ? rawLabel : Number(rawLabel);
        if (!position || position < 1) return;

        const scores = buildPopoverScores({ chartDatasets: chart.data.datasets, index, companionSeries: companionMapsRef.current, position });

        const rect = chart.canvas.getBoundingClientRect();
        const x = rect.left + (point?.x ?? 0);
        const y = rect.top + (point?.y ?? 0);

        chart.$verticalMarkerPosition = position;
        chart.update();

        setPopover({ x, y, position, scores, sequence });
      },
    };

    chartRef.current = new ChartJS(canvasRef.current, {
      type,
      data: { labels: shapedLabels, datasets: shapedDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        ...mergedOptions,
      },
    });

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      if (container) {
        container.removeEventListener("mousemove", handleMouseMove);
        container.removeEventListener("mouseleave", handleMouseLeave);
      }
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line
  }, [type, sequence]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const { shapedLabels, shapedDatasets, yExtent } = shapeData(labels, datasets);
    chart.data.labels = shapedLabels;
    chart.data.datasets = shapedDatasets;
    if (chart.options.scales?.y) Object.assign(chart.options.scales.y, yExtent);
    chart.update();
  }, [labels, datasets]);

  const zoomIn = () => chartRef.current?.zoom(1.2);
  const zoomOut = () => chartRef.current?.zoom(0.8);
  const resetZoom = () => chartRef.current?.resetZoom();

  const closePopover = () => {
    if (chartRef.current) {
      chartRef.current.$verticalMarkerPosition = null;
      chartRef.current.update();
    }
    setPopover(null);
  };

  return h("div", { style: "display:flex; flex-direction:column; gap:0.25rem;" },
    h("div", { class: "chart-toolbar", style: "justify-content:flex-end;" },
      h("button", { type: "button", class: "chart-toolbar__btn", title: "Zoom out", onClick: zoomOut }, "−"),
      h("button", { type: "button", class: "chart-toolbar__btn", title: "Zoom in", onClick: zoomIn }, "+"),
      h("button", { type: "button", class: "chart-toolbar__btn", title: "Reset zoom", onClick: resetZoom }, "⌂")
    ),
    h("div", { ref: containerRef, style: `height:${height}px; position:relative;` },
      h("canvas", { ref: canvasRef }),
      popover ? h(Popover, {
        key: `${popover.position}-${popover.x}-${popover.y}`,
        x: popover.x,
        y: popover.y,
        position: popover.position,
        scores: popover.scores,
        sequence: popover.sequence,
        onClose: closePopover,
      }) : null
    )
  );
}
