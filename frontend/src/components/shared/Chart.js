import { h, useEffect, useRef } from "../../lib/preact.js";
import ChartJS from "https://esm.sh/chart.js@4.4.4/auto";

// Thin Chart.js wrapper shared by every probability/delta/scatter view.
// `type` follows Chart.js chart types: 'line' | 'bar' | 'scatter' | ...
export function Chart({ type = "line", labels = [], datasets = [], height = 260, options = {} }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    chartRef.current = new ChartJS(canvasRef.current, {
      type,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        ...options,
      },
    });
    return () => chartRef.current?.destroy();
    // eslint-disable-next-line
  }, [type]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update();
  }, [labels, datasets]);

  return h("div", { style: `height:${height}px; position:relative;` }, h("canvas", { ref: canvasRef }));
}
