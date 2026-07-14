import { html } from "../../lib/preact.js";
import { Chart } from "../../components/shared/Chart.js";
import { flattenDeltaTrack } from "../../lib/sequence.js";
import { TrackedAlterationEntry } from "../pipeline/OutputPanel.js";

// Rows come from two different data sources (see ComparativeView.js):
// per-mutation Δ scores (row.kind === "delta") or per-tracked-alteration
// entries (row.kind === "proba", same shape GET /get/allsimpleprobas
// returns) -- the latter is rendered via the shared TrackedAlterationEntry
// component (Task 20) so Compare stays in sync with Pipeline's output.
export function DetailChart({ row }) {
  if (!row || row.error) {
    return html`<p class="field-hint">Select a row in the ranking table to inspect its full trace.</p>`;
  }
  // Task 20: proba-mode rows come from GET /get/allsimpleprobas, one entry
  // per tracked alteration -- render the same delta-vs-base bar charts
  // Pipeline's Tracked Alterations output uses, reusing that component so
  // the two stay in sync. Delta-mode rows (a user-typed batch of point
  // mutations scored against the baseline) are already delta values from a
  // different endpoint entirely and keep their existing line-chart rendering.
  if (row.kind === "proba") {
    return html`
      <div>
        <p class="field-hint">Per-position trace for <strong class="mono">${row.mutation}</strong></p>
        <${TrackedAlterationEntry} label=${row.mutation} entry=${row.resultData} />
      </div>
    `;
  }
  // row.kind === "delta": a user-typed batch of point mutations scored
  // against the baseline (GetDeltaScore-shaped response).
  const acceptor = flattenDeltaTrack(row.resultData.acceptor_proba);
  const donor = flattenDeltaTrack(row.resultData.donor_proba);
  const seq = row.resultData?.["altered sequence"];
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
        sequence=${seq}
      />
    </div>
  `;
}
