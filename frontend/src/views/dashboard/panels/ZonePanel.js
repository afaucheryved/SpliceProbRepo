import { html, useState, useEffect } from "../../../lib/preact.js";
import { workspace, useWorkspace } from "../../../lib/workspace.js";

function parseZoneKey(key) {
  const matches = [...key.matchAll(/'(>p\.(\d+)\.[a-zA-Z]>[a-zA-Z])'/g)];
  return {
    label: matches.map((m) => m[1]).join(", ") || key,
    positions: matches.map((m) => Number(m[2]) - 1),
  };
}

// PELT zone detection + ranked windowed-mutant scoring. Reports the
// positions touched by the top-ranked patterns back up to DashboardView so
// GenomeTrack can highlight them -- the endpoint itself does not expose
// zone boundaries directly, only the scored patterns found inside them.
export function ZonePanel({ onPositions }) {
  const ws = useWorkspace();
  const [params, setParams] = useState({ step: 5, penality: 2, threshold: 20, specified_models_used: [5] });
  const [rows, setRows] = useState([]);

  const set = (key, value) => setParams((p) => ({ ...p, [key]: value }));

  async function run() {
    try {
      const data = await workspace.analyzeZones(params);
      const parsed = Object.entries(data ?? {}).map(([key, score]) => ({ ...parseZoneKey(key), score }));
      parsed.sort((a, b) => b.score - a.score);
      setRows(parsed);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => {
    onPositions?.(rows.slice(0, 5).flatMap((r) => r.positions.map((p) => [p, p])));
  }, [rows]);

  return html`
    <div class="panel dashboard-panel">
      <h3 class="panel__title">Zone Analysis (PELT)</h3>
      <div class="field-row">
        <div class="field"><label>Step</label><input type="number" value=${params.step} onInput=${(e) => set("step", parseInt(e.currentTarget.value || "1", 10))} /></div>
        <div class="field"><label>Penalty</label><input type="number" value=${params.penality} onInput=${(e) => set("penality", parseInt(e.currentTarget.value || "1", 10))} /></div>
        <div class="field"><label>Threshold %</label><input type="number" value=${params.threshold} onInput=${(e) => set("threshold", parseInt(e.currentTarget.value || "1", 10))} /></div>
      </div>
      <button type="button" class="btn btn--small btn--primary" disabled=${!ws.sessionId || ws.busy} onClick=${run}>
        Run analysis
      </button>
      <div class="scroll-y dashboard-panel__scroll">
        <table class="data-table">
          <thead><tr><th>Pattern</th><th>Score</th></tr></thead>
          <tbody>
            ${rows.slice(0, 25).map((r, i) => html`<tr key=${i}><td class="mono">${r.label}</td><td>${r.score.toFixed(5)}</td></tr>`)}
          </tbody>
        </table>
        ${rows.length === 0 ? html`<p class="field-hint">No results yet.</p>` : null}
      </div>
    </div>
  `;
}
