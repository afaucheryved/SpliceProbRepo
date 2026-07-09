import { html } from "../../lib/preact.js";
import { Chart } from "../../components/shared/Chart.js";
import { SequenceTrack } from "../../components/shared/SequenceTrack.js";
import { useWorkspace } from "../../lib/workspace.js";
import { flattenProbaTrack, flattenDeltaTrack, parseTrackedLabel } from "../../lib/sequence.js";

// Best-effort parse of a pattern-in-zona dict key. The backend's return
// type is `dict[set[mut], float]` but the actual runtime keys are Python
// tuples of mutation strings; once JSON-serialized they arrive as a
// stringified tuple repr, e.g. "('>p.5.a>g', '>p.6.t>c')".
function parseZoneKey(key) {
  const matches = [...key.matchAll(/'(>p\.\d+\.[a-zA-Z]>[a-zA-Z])'/g)].map((m) => m[1]);
  return matches.length ? matches.join(", ") : key;
}

// Build a Map from 0-based position index → operation summary string from
// the tracked-alteration data returned by GET /get/allsimpleprobas.
// Each entry's label (e.g. "1: insert:aaaa@12") is parsed to extract the
// position range and operation summary.
function buildOperationsMap(probaHistoryData) {
  if (!probaHistoryData) return null;
  const ops = new Map();
  for (const [label] of Object.entries(probaHistoryData)) {
    const parsed = parseTrackedLabel(label);
    if (!parsed) continue;
    for (let i = parsed.from; i <= parsed.to; i++) {
      ops.set(i, parsed.summary);
    }
  }
  return ops.size > 0 ? ops : null;
}

function SequenceOutput({ sequence, operations }) {
  const ws = useWorkspace();
  return html`
    <div>
      <p class="output-panel__hint">Resulting sequence after this recipe step (diff vs. the original base sequence):</p>
      <${SequenceTrack} sequence=${sequence} reference=${ws.baseSequence} operations=${operations} />
    </div>
  `;
}

function ProbaOutput({ data }) {
  const acceptor = flattenProbaTrack(data.acceptor_proba);
  const donor = flattenProbaTrack(data.donor_proba);
  return html`
    <div>
      <p class="output-panel__hint">
        Baseline splicing probability is quantitative → rendered as a chart instead of a raw sequence.
      </p>
      <${Chart}
        type="line"
        labels=${acceptor.positions.map((p) => p + 1)}
        datasets=${[
          { label: "Acceptor gain", data: acceptor.values, borderColor: "#60a5fa", pointRadius: 0, borderWidth: 1.5 },
          { label: "Donor gain", data: donor.values, borderColor: "#fbbf24", pointRadius: 0, borderWidth: 1.5 },
        ]}
        options=${{ scales: { x: { title: { display: true, text: "Position" } }, y: { title: { display: true, text: "Probability" } } } }}
      />
    </div>
  `;
}

function ProbaHistoryOutput({ data }) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) {
    return html`<p class="output-panel__hint">No alterations tracked yet in this session — run an Index-based or Pattern-based block first.</p>`;
  }
  return html`
    <div>
      <p class="output-panel__hint">
        Baseline splicing probability per tracked alteration (one chart per entry, chronological order).
      </p>
      ${entries.map(([label, entry]) => {
        const acceptor = flattenProbaTrack(entry.acceptor_proba);
        const donor = flattenProbaTrack(entry.donor_proba);
        return html`
          <div class="output-panel__history-entry" key=${label}>
            <p class="output-panel__history-label mono">${label}</p>
            <${Chart}
              type="line"
              height=${160}
              labels=${acceptor.positions.map((p) => p + 1)}
              datasets=${[
                { label: "Acceptor gain", data: acceptor.values, borderColor: "#60a5fa", pointRadius: 0, borderWidth: 1.5 },
                { label: "Donor gain", data: donor.values, borderColor: "#fbbf24", pointRadius: 0, borderWidth: 1.5 },
              ]}
              options=${{ scales: { x: { title: { display: true, text: "Position" } }, y: { title: { display: true, text: "Probability" } } } }}
            />
          </div>
        `;
      })}
    </div>
  `;
}

function DeltaOutput({ data }) {
  const acceptor = flattenDeltaTrack(data.acceptor_proba);
  const donor = flattenDeltaTrack(data.donor_proba);
  return html`
    <div>
      <p class="output-panel__hint">Delta score is quantitative → rendered as a chart.</p>
      <${Chart}
        type="bar"
        labels=${acceptor.positions.map((p) => p + 1)}
        datasets=${[
          { label: "Δ acceptor", data: acceptor.values, backgroundColor: "#60a5fa" },
          { label: "Δ donor", data: donor.values, backgroundColor: "#fbbf24" },
        ]}
        options=${{ scales: { x: { title: { display: true, text: "Position" } }, y: { title: { display: true, text: "Δ probability" } } } }}
      />
    </div>
  `;
}

function ZonesOutput({ data }) {
  const rows = Object.entries(data ?? {})
    .map(([key, score]) => ({ pattern: parseZoneKey(key), score }))
    .sort((a, b) => b.score - a.score);
  return html`
    <div>
      <p class="output-panel__hint">Ranked mutation patterns within the detected high-impact zones.</p>
      <table class="data-table">
        <thead><tr><th>Mutation pattern</th><th>Impact score</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => html`<tr key=${i}><td class="mono">${r.pattern}</td><td>${r.score.toFixed(5)}</td></tr>`)}
        </tbody>
      </table>
      ${rows.length === 0 ? html`<p class="output-panel__hint">No zones met the significance threshold.</p>` : null}
    </div>
  `;
}

export function OutputPanel({ result }) {
  if (!result) {
    return html`<p class="output-panel__hint">Run the recipe to see output here.</p>`;
  }
  const { kind, data, operations } = result;
  return html`
    <div class="output-panel">
      ${kind === "sequence" ? html`<${SequenceOutput} sequence=${data} operations=${operations} />` : null}
      ${kind === "proba" ? html`<${ProbaOutput} data=${data} />` : null}
      ${kind === "probaHistory" ? html`<${ProbaHistoryOutput} data=${data} />` : null}
      ${kind === "delta" ? html`<${DeltaOutput} data=${data} />` : null}
      ${kind === "zones" ? html`<${ZonesOutput} data=${data} />` : null}
    </div>
  `;
}
