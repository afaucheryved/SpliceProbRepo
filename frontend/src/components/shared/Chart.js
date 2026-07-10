import { h, useEffect, useRef, useState } from "../../lib/preact.js";
import ChartJS from "https://esm.sh/chart.js@4.4.4/auto";
import { Popover } from "./Popover.js";

// Thin Chart.js wrapper shared by every probability/delta/scatter view.
//
// `type` follows Chart.js chart types: 'line' | 'bar' | 'scatter' | ...
//
// When `sequence` is provided, clicking a data point opens a popup showing:
//   - Position (1-based)
//   - Score for each dataset at that point
//   - ±10 bases of sequence context around the clicked position
export function Chart({ type = "line", labels = [], datasets = [], height = 260, options = {}, sequence }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [popover, setPopover] = useState(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    // Build the click handler, merging with any user-supplied onClick.
    const userOnClick = options.onClick;
    const mergedOptions = {
      ...options,
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

  return h("div", { style: `height:${height}px; position:relative;` },
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
  );
}