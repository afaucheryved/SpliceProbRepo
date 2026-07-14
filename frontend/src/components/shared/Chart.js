import { h, useEffect, useMemo, useRef, useState } from "../../lib/preact.js";
import ChartJS from "https://esm.sh/chart.js@4.4.4/auto";
import zoomPlugin from "https://esm.sh/chartjs-plugin-zoom@2?deps=chart.js@4.4.4";
import { Popover } from "./Popover.js";
import { resolveNearestBarIndex, buildPositionValueMap, buildPopoverScores, computeYAxisExtent, aggregateBarSeries } from "../../lib/chartLogic.js";
import { getTheme, seriesColors } from "../../lib/theme.js";

// Draws a persistent vertical line at the last-clicked data position (item
// 7a). Reads its target off `chart.$verticalMarkerPosition` (a label value,
// i.e. a 1-based sequence position) rather than a fixed pixel, so the line
// stays glued to that position across pan/zoom redraws. Cleared by setting
// the value back to null and calling chart.update().
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

// Registered once, shared by every Chart instance.
ChartJS.register(zoomPlugin, verticalMarkerPlugin);

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
  const [popover, setPopover] = useState(null);

  const companionMaps = useMemo(
    () => (companionDatasets || []).map((c) => ({ label: c.label, map: buildPositionValueMap(c.positions, c.values) })),
    [companionDatasets]
  );
  // Read by the click handler closure below -- kept out of the chart-creation
  // effect's dependency array (companionDatasets is a fresh array literal on
  // every caller render) so a new companion series doesn't force a full
  // Chart.js teardown/rebuild; the ref keeps the closure's read fresh instead.
  const companionMapsRef = useRef(companionMaps);
  useEffect(() => {
    companionMapsRef.current = companionMaps;
  }, [companionMaps]);

  // Shapes raw labels/datasets into whatever actually gets handed to
  // Chart.js (bar aggregation + y-axis extent). aggregateBarSeries already
  // carries each slot's *real* sequence position through as its label, so
  // no separate index-remapping is needed downstream -- reading
  // chart.data.labels[index] always yields the true position, aggregated or
  // not.
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
            // Hide the synthetic "compressed run" half of an aggregated
            // series -- it shares its label with the real series.
            filter: (item, data) => !data.datasets[item.datasetIndex]?._aggregatedGap,
          },
        },
        zoom: {
          pan: { enabled: true, mode: "x" },
          zoom: {
            // Ctrl+scroll only (item 5) -- plain wheel and drag-to-select
            // zoom removed so the wheel is free for normal page scrolling.
            wheel: { enabled: true, modifierKey: "ctrl" },
            pinch: { enabled: true },
            drag: { enabled: false },
            mode: "x",
          },
        },
      },
      onClick: (evt, elements, chart) => {
        if (userOnClick) userOnClick(evt, elements, chart);
        if (!sequence || !elements.length) return;

        const el = elements[0];
        let index = el.index;
        if (type === "bar") {
          index = resolveNearestBarIndex({ chart, datasetIndex: el.datasetIndex, fallbackIndex: el.index, clickX: evt.x });
        }

        const rawLabel = chart.data.labels[index];
        const position = typeof rawLabel === "number" ? rawLabel : Number(rawLabel);
        if (!position || position < 1) return;

        const scores = buildPopoverScores({ chartDatasets: chart.data.datasets, index, companionSeries: companionMapsRef.current, position });

        const rect = chart.canvas.getBoundingClientRect();
        const meta = chart.getDatasetMeta(el.datasetIndex);
        const point = meta.data[index];
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
        interaction: { mode: "index", intersect: false },
        ...mergedOptions,
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // Intentionally depends on type + sequence + the *reference* of options
    // (not deep-compare) -- these change together exactly when OutputPanel
    // hands the chart a fresh result, which is when the click handler's
    // closed-over data needs to be fresh too. companionDatasets is
    // deliberately excluded (see companionMapsRef above) -- callers pass a
    // fresh array literal every render, and depending on it here would tear
    // down and rebuild the Chart.js instance (losing zoom/pan state) on
    // essentially every re-render of the parent.
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
    h("div", { class: "chart-toolbar" },
      h("button", { type: "button", class: "chart-toolbar__btn", title: "Zoom out", onClick: zoomOut }, "−"),
      h("span", { class: "chart-toolbar__hint" }, "Ctrl + scroll to zoom"),
      h("button", { type: "button", class: "chart-toolbar__btn", title: "Zoom in", onClick: zoomIn }, "+"),
      h("button", { type: "button", class: "chart-toolbar__btn", title: "Reset zoom", onClick: resetZoom }, "⌂")
    ),
    h("div", { style: `height:${height}px; position:relative;` },
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
