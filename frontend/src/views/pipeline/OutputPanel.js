import { html } from "../../lib/preact.js";
import { Chart } from "../../components/shared/Chart.js";
import { SequenceTrack } from "../../components/shared/SequenceTrack.js";
import { useWorkspace } from "../../lib/workspace.js";
import { useTheme, seriesColors } from "../../lib/theme.js";
import { flattenProbaTrack, flattenDeltaTrack, deltaBarColors, zoneBorderStyle, trackedEntryZone, parseTrackedAlterationDisplay, topTrackedEntries } from "../../lib/sequence.js";

// Best-effort parse of a pattern-in-zona dict key. The backend's return
// type is `dict[set[mut], float]` but the actual runtime keys are Python
// tuples of mutation strings; once JSON-serialized they arrive as a
// stringified tuple repr, e.g. "('>p.5.a>g', '>p.6.t>c')".
function parseZoneKey(key) {
  const matches = [...key.matchAll(/'(>p\.\d+\.[a-zA-Z]>[a-zA-Z])'/g)].map((m) => m[1]);
  return matches.length ? matches.join(", ") : key;
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

// Item 7a: acceptor and donor gain are split into two separate chart
// instances (rather than one two-line chart) so each reads clearly on its
// own scale, but a click on either must still show both scores at that
// position -- `companionDatasets` feeds the other series' values into this
// chart's popover without this chart owning or rendering that data itself.
function ProbaOutput({ data, sequence }) {
  const theme = useTheme();
  const colors = seriesColors(theme);
  const acceptor = flattenProbaTrack(data.acceptor_proba);
  const donor = flattenProbaTrack(data.donor_proba);
  return html`
    <div>
      <p class="output-panel__hint">
        Baseline splicing probability is quantitative → rendered as a chart instead of a raw sequence.
      </p>
      <${Chart}
        type="line"
        height=${160}
        labels=${acceptor.positions.map((p) => p + 1)}
        datasets=${[
          { label: "Acceptor gain", data: acceptor.values, borderColor: colors.acceptor, pointRadius: 0, borderWidth: 1.5 },
        ]}
        companionDatasets=${[{ label: "Donor gain", positions: donor.positions, values: donor.values }]}
        options=${{ scales: { x: { title: { display: true, text: "Position" } }, y: { title: { display: true, text: "Acceptor probability" } } } }}
        sequence=${sequence}
      />
      <${Chart}
        type="line"
        height=${160}
        labels=${donor.positions.map((p) => p + 1)}
        datasets=${[
          { label: "Donor gain", data: donor.values, borderColor: colors.donor, pointRadius: 0, borderWidth: 1.5 },
        ]}
        companionDatasets=${[{ label: "Acceptor gain", positions: acceptor.positions, values: acceptor.values }]}
        options=${{ scales: { x: { title: { display: true, text: "Position" } }, y: { title: { display: true, text: "Donor probability" } } } }}
        sequence=${sequence}
      />
    </div>
  `;
}

// One tracked-alteration entry's output. Delta-vs-base-sequence bar charts,
// split acceptor/donor, bars colored green (increase) / red (decrease)
// (Task 20). The label and a bar border are colored to mark either:
//   - pale red (Task 18): this entry is one of Task 17's per-match
//     pattern-based variants -- the border marks that specific match, using
//     the exact range Task 17 stored on the entry (`match_start`/`match_end`).
//   - pale green (Task 20): any other entry with a determinable affected
//     zone (from `parseTrackedLabel()`).
// Falls back to the pre-Task-20 absolute-probability chart when the entry's
// altered sequence changed length (no sound position-wise delta against the
// base -- see `delta_proba`'s absence).
export function TrackedAlterationEntry({ label, entry }) {
  const theme = useTheme();
  const colors = seriesColors(theme);
  const entrySeq = entry["altered sequence"];
  const { range } = trackedEntryZone(label, entry);
  const disp = parseTrackedAlterationDisplay(label, entry);

  if (!entry.delta_proba) {
    const acceptor = flattenProbaTrack(entry.acceptor_proba);
    const donor = flattenProbaTrack(entry.donor_proba);
    return html`
      <div class="output-panel__history-entry" key=${label}>
        <p class="output-panel__history-label mono">${disp ? html`<strong>${disp.stepNum}</strong> : <strong>${disp.opType}</strong> : ${disp.rangeText}` : label}</p>
        <p class="field-hint">Delta view not available — this operation changes the sequence length.</p>
        <${Chart}
          type="line"
          height=${160}
          labels=${acceptor.positions.map((p) => p + 1)}
          datasets=${[
            { label: "Acceptor gain", data: acceptor.values, borderColor: colors.acceptor, pointRadius: 0, borderWidth: 1.5 },
            { label: "Donor gain", data: donor.values, borderColor: colors.donor, pointRadius: 0, borderWidth: 1.5 },
          ]}
          options=${{ scales: { x: { title: { display: true, text: "Position" } }, y: { title: { display: true, text: "Probability" } } } }}
          sequence=${entrySeq}
        />
      </div>
    `;
  }

  const acceptor = flattenDeltaTrack(entry.delta_proba.acceptor_proba);
  const donor = flattenDeltaTrack(entry.delta_proba.donor_proba);
  const acceptorZone = zoneBorderStyle(acceptor.positions, range);
  const donorZone = zoneBorderStyle(donor.positions, range);
  return html`
    <div class="output-panel__history-entry" key=${label}>
      <p class="output-panel__history-label mono">${disp ? html`<strong>${disp.stepNum}</strong> : <strong>${disp.opType}</strong> : ${disp.rangeText}` : label}</p>
      ${range ? html`<p class="field-hint output-panel__zone-hint">tracked mutation</p>` : null}
      <${Chart}
        type="bar"
        height=${140}
        labels=${acceptor.positions.map((p) => p + 1)}
        datasets=${[
          {
            label: "Δ acceptor",
            data: acceptor.values,
            backgroundColor: deltaBarColors(acceptor.values, colors),
            borderColor: acceptorZone.borderColor,
            borderWidth: acceptorZone.borderWidth,
          },
        ]}
        options=${{ scales: { x: { title: { display: true, text: "Position" } }, y: { title: { display: true, text: "Δ acceptor probability" } } } }}
        sequence=${entrySeq}
      />
      <${Chart}
        type="bar"
        height=${140}
        labels=${donor.positions.map((p) => p + 1)}
        datasets=${[
          {
            label: "Δ donor",
            data: donor.values,
            backgroundColor: deltaBarColors(donor.values, colors),
            borderColor: donorZone.borderColor,
            borderWidth: donorZone.borderWidth,
          },
        ]}
        options=${{ scales: { x: { title: { display: true, text: "Position" } }, y: { title: { display: true, text: "Δ donor probability" } } } }}
        sequence=${entrySeq}
      />
    </div>
  `;
}

function ProbaHistoryOutput({ data, params }) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) {
    return html`<p class="output-panel__hint">No alterations tracked yet in this session — run an Index-based or Pattern-based block first.</p>`;
  }

  let renderedEntries = entries;
  if (params?.showTopOnly && entries.length > 0) {
    renderedEntries = topTrackedEntries(data, params.topN).map((s) => [s.label, s.entry]);
  }
  return html`
    <div>
      <p class="output-panel__hint">
        Change in splicing probability vs. the base sequence, per tracked alteration (one acceptor/donor pair per entry, chronological order).
      </p>
      ${renderedEntries.map(([label, entry]) => html`<${TrackedAlterationEntry} key=${label} label=${label} entry=${entry} />`)}
    </div>
  `;
}

function DeltaOutput({ data, sequence }) {
  const theme = useTheme();
  const colors = seriesColors(theme);
  const acceptor = flattenDeltaTrack(data.acceptor_proba);
  const donor = flattenDeltaTrack(data.donor_proba);
  return html`
    <div>
      <p class="output-panel__hint">Delta score is quantitative → rendered as a chart.</p>
      <${Chart}
        type="bar"
        labels=${acceptor.positions.map((p) => p + 1)}
        datasets=${[
          { label: "Δ acceptor", data: acceptor.values, backgroundColor: colors.deltaAcceptor },
          { label: "Δ donor", data: donor.values, backgroundColor: colors.deltaDonor },
        ]}
        options=${{ scales: { x: { title: { display: true, text: "Position" } }, y: { title: { display: true, text: "Δ probability" } } } }}
        sequence=${sequence}
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

  const results = result.allResults && result.allResults.length > 0 ? result.allResults : [result];

  function renderResult(r, i) {
    const { kind, data } = r;
    const seq = data?.["altered sequence"];
    const ops = i === results.length - 1 ? result.operations : null;
    return html`
      ${i > 0 ? html`<hr class="output-panel__divider" />` : null}
      ${kind === "sequence" ? html`<${SequenceOutput} sequence=${data} operations=${ops} />` : null}
      ${kind === "proba" ? html`<${ProbaOutput} data=${data} sequence=${seq} />` : null}
      ${kind === "probaHistory" ? html`<${ProbaHistoryOutput} data=${data} params=${r.params} />` : null}
      ${kind === "delta" ? html`<${DeltaOutput} data=${data} sequence=${seq} />` : null}
      ${kind === "zones" ? html`<${ZonesOutput} data=${data} />` : null}
    `;
  }

  return html`
    <div class="output-panel">
      ${results.map((r, i) => renderResult(r, i))}
    </div>
  `;
}
