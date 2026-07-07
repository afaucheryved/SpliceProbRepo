import { html } from "../../../lib/preact.js";
import { Badge } from "../../../components/shared/Feedback.js";
import { useWorkspace } from "../../../lib/workspace.js";

const TONE = { init: "accent", structural: "positive", probe: "neutral", error: "negative" };

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
    </div>
  `;
}
