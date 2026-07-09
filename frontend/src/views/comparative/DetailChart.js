import { html } from "../../lib/preact.js";
import { Chart } from "../../components/shared/Chart.js";
import { flattenDeltaTrack, flattenProbaTrack } from "../../lib/sequence.js";

// Rows come from two different data sources (see ComparativeView.js):
// per-mutation Δ scores (row.kind === "delta") or per-tracked-alteration
// baseline probability (row.kind === "proba"). Each needs its own flatten
// function and axis labels since the backend shapes differ.
export function DetailChart({ row }) {
  if (!row || row.error) {
    return html`<p class="field-hint">Select a row in the ranking table to inspect its full trace.</p>`;
  }
  const isProba = row.kind === "proba";
  const flatten = isProba ? flattenProbaTrack : flattenDeltaTrack;
  const acceptor = flatten(row.resultData.acceptor_proba);
  const donor = flatten(row.resultData.donor_proba);
  const acceptorLabel = isProba ? "Acceptor gain" : "Δ acceptor";
  const donorLabel = isProba ? "Donor gain" : "Δ donor";
  return html`
    <div>
      <p class="field-hint">Per-position ${isProba ? "baseline" : "Δ"} trace for <strong class="mono">${row.mutation}</strong></p>
      <${Chart}
        type="line"
        height=${200}
        labels=${acceptor.positions.map((p) => p + 1)}
        datasets=${[
          { label: acceptorLabel, data: acceptor.values, borderColor: "#2563eb", pointRadius: 0, borderWidth: 1.5 },
          { label: donorLabel, data: donor.values, borderColor: "#d97706", pointRadius: 0, borderWidth: 1.5 },
        ]}
      />
    </div>
  `;
}
