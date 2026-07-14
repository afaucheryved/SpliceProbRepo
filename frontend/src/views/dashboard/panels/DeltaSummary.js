import { html, useMemo } from "../../../lib/preact.js";
import { StatTile } from "../../../components/shared/Feedback.js";
import { useWorkspace } from "../../../lib/workspace.js";
import { flattenDeltaTrack } from "../../../lib/sequence.js";

function peak(values, positions) {
  let best = { value: 0, position: null };
  values.forEach((v, i) => {
    if (Math.abs(v) > Math.abs(best.value)) best = { value: v, position: positions[i] + 1 };
  });
  return best;
}

// Summary stat tiles derived client-side from the last delta-score
// response -- no backend scoring endpoint is called here, just simple
// min/max aggregation over data already returned by /GetDeltaScore/.
export function DeltaSummary() {
  const ws = useWorkspace();
  const delta = ws.lastResult?.type === "delta" ? ws.lastResult.data : null;

  const summary = useMemo(() => {
    if (!delta) return null;
    const acceptor = flattenDeltaTrack(delta.acceptor_proba);
    const donor = flattenDeltaTrack(delta.donor_proba);
    return {
      acceptorPeak: peak(acceptor.values, acceptor.positions),
      donorPeak: peak(donor.values, donor.positions),
      meanAbsAcceptor: acceptor.values.reduce((a, v) => a + Math.abs(v), 0) / (acceptor.values.length || 1),
      meanAbsDonor: donor.values.reduce((a, v) => a + Math.abs(v), 0) / (donor.values.length || 1),
    };
  }, [delta]);

  return html`
    <div class="panel dashboard-panel">
      <h3 class="panel__title">Delta Summary</h3>
      ${summary
        ? html`
            <div class="stat-tile-grid">
              <${StatTile}
                label="Peak Δ acceptor"
                value=${summary.acceptorPeak.value.toFixed(4)}
                sublabel=${summary.acceptorPeak.position ? `at position ${summary.acceptorPeak.position}` : "—"}
                tone=${summary.acceptorPeak.value < 0 ? "negative" : "positive"}
              />
              <${StatTile}
                label="Peak Δ donor"
                value=${summary.donorPeak.value.toFixed(4)}
                sublabel=${summary.donorPeak.position ? `at position ${summary.donorPeak.position}` : "—"}
                tone=${summary.donorPeak.value < 0 ? "negative" : "positive"}
              />
              <${StatTile} label="Mean |Δ| acceptor" value=${summary.meanAbsAcceptor.toFixed(4)} />
              <${StatTile} label="Mean |Δ| donor" value=${summary.meanAbsDonor.toFixed(4)} />
            </div>
          `
        : html`<p class="field-hint">Compute a delta score to populate this summary.</p>`}
    </div>
  `;
}
