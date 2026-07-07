import { html } from "../../lib/preact.js";
import { Chart } from "../../components/shared/Chart.js";
import { flattenDeltaTrack } from "../../lib/sequence.js";

export function DetailChart({ row }) {
  if (!row || row.error) {
    return html`<p class="field-hint">Select a row in the ranking table to inspect its full delta trace.</p>`;
  }
  const acceptor = flattenDeltaTrack(row.deltaData.acceptor_proba);
  const donor = flattenDeltaTrack(row.deltaData.donor_proba);
  return html`
    <div>
      <p class="field-hint">Per-position Δ trace for <strong class="mono">${row.mutation}</strong></p>
      <${Chart}
        type="line"
        height=${200}
        labels=${acceptor.positions.map((p) => p + 1)}
        datasets=${[
          { label: "Δ acceptor", data: acceptor.values, borderColor: "#2563eb", pointRadius: 0, borderWidth: 1.5 },
          { label: "Δ donor", data: donor.values, borderColor: "#d97706", pointRadius: 0, borderWidth: 1.5 },
        ]}
      />
    </div>
  `;
}
