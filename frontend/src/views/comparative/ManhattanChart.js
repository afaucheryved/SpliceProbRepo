import { html } from "../../lib/preact.js";
import { Chart } from "../../components/shared/Chart.js";

// Manhattan-plot-style overview: one point per batched mutation, x = its
// position in the sequence, y = aggregate |Δ| impact (Σ|Δ acceptor| +
// Σ|Δ donor|, computed client-side from already-fetched delta responses).
export function ManhattanChart({ rows, focusedIndex, onFocus }) {
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
          label: "Mutation impact",
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
          y: { title: { display: true, text: "Impact  Σ|Δ acceptor| + Σ|Δ donor|" } },
        },
        plugins: { legend: { display: false } },
      }}
    />
  `;
}
