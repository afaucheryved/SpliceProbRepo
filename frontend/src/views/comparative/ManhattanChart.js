import { html } from "../../lib/preact.js";
import { Chart } from "../../components/shared/Chart.js";

const Y_AXIS_TITLE = {
  delta: "Impact  Σ|Δ acceptor| + Σ|Δ donor|",
  proba: "Signal  Σ acceptor proba + Σ donor proba",
};

// Manhattan-plot-style overview: one point per row (batched mutation, or
// tracked alteration -- see ComparativeView.js), x = its position in the
// sequence, y = an aggregate impact/signal metric computed client-side
// from the already-fetched per-row response.
export function ManhattanChart({ rows, focusedIndex, onFocus, mode = "delta" }) {
  const points = rows
    .map((r, i) => ({ x: r.position, y: r.error ? 0 : r.totalAbs, i }))
    .filter((p) => !rows[p.i].error);

  return html`
    <${Chart}
      type="scatter"
      height=${220}
      labels=${[]}
      datasets=${[
        {
          label: mode === "proba" ? "Baseline signal" : "Mutation impact",
          data: points,
          backgroundColor: points.map((p) => (p.i === focusedIndex ? "#dc2626" : "#2563eb")),
          pointRadius: points.map((p) => (p.i === focusedIndex ? 6 : 3.5)),
        },
      ]}
      options=${{
        onClick: (_evt, elements) => {
          if (elements.length) onFocus(points[elements[0].index].i);
        },
        scales: {
          x: { title: { display: true, text: "Position (1-based)" } },
          y: { title: { display: true, text: Y_AXIS_TITLE[mode] } },
        },
        plugins: { legend: { display: false } },
      }}
    />
  `;
}
