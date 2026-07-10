import { html, useState } from "../../../lib/preact.js";
import { Badge } from "../../../components/shared/Feedback.js";
import { useWorkspace } from "../../../lib/workspace.js";
import { api } from "../../../api/client.js";
import { flattenProbaTrack, flattenDeltaTrack, trackedEntryZone } from "../../../lib/sequence.js";

const TONE = { init: "accent", structural: "positive", probe: "neutral", error: "negative" };

// Largest-magnitude {value, position} pair in a flattened proba track --
// a quick eyeball summary rather than the full per-position chart.
function peak(track) {
  let best = { value: 0, position: null };
  track.values.forEach((v, i) => {
    if (Math.abs(v) > Math.abs(best.value)) best = { value: v, position: track.positions[i] + 1 };
  });
  return best;
}

// Baseline acceptor/donor probability for every alteration tracked so far
// in this session, fetched from GET /get/allsimpleprobas on demand (it's a
// separate call, not part of the live `ws.history` stream, so it stays
// in sync with the backend's own record rather than the client's).
function TrackedProbabilities() {
  const ws = useWorkspace();
  const [probas, setProbas] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    if (!ws.sessionId) return;
    setLoading(true);
    setError(null);
    try {
      setProbas(await api.get.allSimpleProbas(ws.sessionId));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  const rows = Object.entries(probas ?? {});

  return html`
    <div class="history-log__probas">
      <div class="history-log__probas-header">
        <span class="panel__subtitle">Baseline probabilities</span>
        <button type="button" class="btn btn--small" disabled=${loading || !ws.sessionId} onClick=${load}>
          ${loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      ${error ? html`<p class="field-hint">⚠ ${error}</p>` : null}
      ${probas === null && !error ? html`<p class="field-hint">Not loaded yet — click Refresh.</p>` : null}
      ${probas !== null && rows.length === 0 ? html`<p class="field-hint">No alterations tracked yet.</p>` : null}
      ${rows.map(([label, entry]) => {
        // Task 20: report the change vs. the base sequence (delta) when
        // available, falling back to absolute baseline probability for
        // length-changing entries (no sound position-wise delta there).
        const hasDelta = Boolean(entry.delta_proba);
        const acceptorPeak = peak(hasDelta ? flattenDeltaTrack(entry.delta_proba.acceptor_proba) : flattenProbaTrack(entry.acceptor_proba));
        const donorPeak = peak(hasDelta ? flattenDeltaTrack(entry.delta_proba.donor_proba) : flattenProbaTrack(entry.donor_proba));
        const { range, isPatternMatch } = trackedEntryZone(label, entry);
        const zoneText = range ? ` (${isPatternMatch ? "match" : "positions"} ${range.from + 1}-${range.to + 1})` : "";
        const zoneLabelClass = isPatternMatch ? "history-log__label--match" : "history-log__label--zone";
        return html`
          <div class="history-log__proba-entry" key=${label}>
            <span class="history-log__label ${zoneLabelClass} mono">${label}${zoneText}</span>
            <span class="history-log__proba-values">
              ${hasDelta ? "Δ " : ""}acceptor
              <span class=${hasDelta ? (acceptorPeak.value >= 0 ? "history-log__value--up" : "history-log__value--down") : ""}>${acceptorPeak.value.toFixed(3)}</span>@${acceptorPeak.position ?? "—"}
              · ${hasDelta ? "Δ " : ""}donor
              <span class=${hasDelta ? (donorPeak.value >= 0 ? "history-log__value--up" : "history-log__value--down") : ""}>${donorPeak.value.toFixed(3)}</span>@${donorPeak.position ?? "—"}
              ${!hasDelta ? html`<span class="field-hint"> (delta not available — length-changing operation)</span>` : null}
            </span>
          </div>
        `;
      })}
    </div>
  `;
}

export function HistoryLog() {
  const ws = useWorkspace();
  const entries = [...ws.history].reverse();
  return html`
    <div class="panel dashboard-panel">
      <h3 class="panel__title">Session Activity</h3>
      <div class="scroll-y dashboard-panel__scroll history-log">
        ${entries.length === 0 ? html`<p class="field-hint">No activity yet.</p>` : null}
        ${entries.map(
          (e) => html`
            <div class="history-log__entry" key=${e.id}>
              <${Badge} tone=${TONE[e.kind] ?? "neutral"}>${e.kind}<//>
              <span class="history-log__label">${e.label}</span>
              <span class="history-log__time">${new Date(e.at).toLocaleTimeString()}</span>
            </div>
          `
        )}
      </div>
      <${TrackedProbabilities} />
    </div>
  `;
}
