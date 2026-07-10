import { h, useEffect, useRef, useState } from "../../lib/preact.js";
import ChartJS from "https://esm.sh/chart.js@4.4.4/auto";
import zoomPlugin from "https://esm.sh/chartjs-plugin-zoom@2?deps=chart.js@4.4.4";
import { Popover } from "./Popover.js";

// Registered once, shared by every Chart instance (Task 13).
ChartJS.register(zoomPlugin);

// Thin Chart.js wrapper shared by every probability/delta/scatter view.
//
// `type` follows Chart.js chart types: 'line' | 'bar' | 'scatter' | ...
//
// When `sequence` is provided, clicking a data point opens a popup showing:
//   - Position (1-based)
//   - Score for each dataset at that point
//   - ±10 bases of sequence context around the clicked position
//
// Every chart gets x-axis zoom/pan (Task 13): scroll-wheel / pinch zoom,
// drag-to-select-region zoom, a +/- /home toolbar, and a pan slider.
export function Chart({ type = "line", labels = [], datasets = [], height = 260, options = {}, sequence }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const panSliderRef = useRef(null);
  const [popover, setPopover] = useState(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    // Build the click handler, merging with any user-supplied onClick.
    const userOnClick = options.onClick;
    const mergedOptions = {
      ...options,
      plugins: {
        ...options.plugins,
        zoom: {
          pan: { enabled: true, mode: "x" },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            // Drag-to-select a region to zoom into (the "magnifying glass"
            // mechanism) -- same underlying zoom/pan state as the toolbar
            // buttons and slider below, not a separate zoom system.
            drag: { enabled: true },
            mode: "x",
          },
        },
      },
      onClick: (evt, elements, chart) => {
        // Call user's own onClick first (e.g. ManhattanChart's row focus).
        if (userOnClick) userOnClick(evt, elements, chart);

        // Then handle the peak-click popup if sequence data is available.
        if (!sequence || !elements.length) return;
        const el = elements[0];
        const datasetIndex = el.datasetIndex;
        const index = el.index;

        // Determine the 1-based position from the label.
        const rawLabel = chart.data.labels[index];
        const position = typeof rawLabel === "number" ? rawLabel : Number(rawLabel);
        if (!position || position < 1) return;

        // Collect scores from every dataset at this point.
        const scores = chart.data.datasets.map((ds) => ({
          label: ds.label || `Dataset ${chart.data.datasets.indexOf(ds) + 1}`,
          value: ds.data[index],
        }));

        // Compute pixel position from the chart's canvas.
        const rect = chart.canvas.getBoundingClientRect();
        const meta = chart.getDatasetMeta(datasetIndex);
        const point = meta.data[index];
        const x = rect.left + (point?.x ?? 0);
        const y = rect.top + (point?.y ?? 0);

        setPopover({ x, y, position, scores, sequence });
      },
    };

    chartRef.current = new ChartJS(canvasRef.current, {
      type,
      data: { labels, datasets },
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
    // Important: we intentionally depend on type + sequence + the *reference* of options
    // (not deep-compare). Sequence and options.onClick changes should recreate the chart
    // to keep the handler closure fresh.
    // eslint-disable-next-line
  }, [type, sequence]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update();
  }, [labels, datasets]);

  // Zoom toolbar handlers (Task 13) -- all operate on the same underlying
  // chartjs-plugin-zoom state as the wheel/pinch/drag-select above.
  const zoomIn = () => chartRef.current?.zoom(1.2);
  const zoomOut = () => chartRef.current?.zoom(0.8);
  const resetZoom = () => chartRef.current?.resetZoom();
  // The slider is a relative scrubber, not an absolute position: each
  // interaction pans by the distance moved from center, then re-centers
  // itself, so it can keep panning in either direction indefinitely without
  // needing to track the chart's total zoomed extent.
  const handlePanSlider = (e) => {
    const value = Number(e.currentTarget.value);
    const delta = value - 50;
    if (delta !== 0) chartRef.current?.pan({ x: -delta * 4 });
    e.currentTarget.value = "50";
  };

  return h("div", { style: "display:flex; flex-direction:column; gap:0.25rem;" },
    h("div", { class: "chart-toolbar" },
      h("button", { type: "button", class: "chart-toolbar__btn", title: "Zoom out", onClick: zoomOut }, "−"),
      h("input", {
        ref: panSliderRef,
        type: "range",
        min: "0",
        max: "100",
        defaultValue: "50",
        class: "chart-toolbar__slider",
        title: "Drag to pan left/right",
        onInput: handlePanSlider,
      }),
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
        onClose: () => setPopover(null),
      }) : null
    )
  );
}