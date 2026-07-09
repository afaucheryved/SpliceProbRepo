import { html, useState } from "../../../lib/preact.js";
import { Badge } from "../../../components/shared/Feedback.js";
import { useWorkspace } from "../../../lib/workspace.js";
import { api } from "../../../api/client.js";
import { flattenProbaTrack } from "../../../lib/sequence.js";

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
        const acceptorPeak = peak(flattenProbaTrack(entry.acceptor_proba));
        const donorPeak = peak(flattenProbaTrack(entry.donor_proba));
        return html`
          <div class="history-log__proba-entry" key=${label}>
            <span class="history-log__label mono">${label}</span>
            <span class="history-log__proba-values">
              acceptor ${acceptorPeak.value.toFixed(3)}@${acceptorPeak.position ?? "—"} · donor ${donorPeak.value.toFixed(3)}@${donorPeak.position ?? "—"}
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
