import { html, useMemo, useState, useEffect } from "../../../lib/preact.js";
import { Chart } from "../../../components/shared/Chart.js";
import { SequenceTrack } from "../../../components/shared/SequenceTrack.js";
import { useWorkspace } from "../../../lib/workspace.js";
import { flattenProbaTrack, flattenDeltaTrack } from "../../../lib/sequence.js";

const DEFAULT_WINDOW = 200;

// Genome-browser-style synchronized view: sequence track above, probability
// (or delta) track below, sharing the same position window/zoom.
export function GenomeTrack({ highlightRanges = [] }) {
  const ws = useWorkspace();
  const seqLen = ws.alteredSequence.length;
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.min(DEFAULT_WINDOW, seqLen || DEFAULT_WINDOW));

  useEffect(() => {
    if (seqLen) setTo((t) => Math.min(t, seqLen));
  }, [seqLen]);

  const windowedSequence = useMemo(
    () => ws.alteredSequence.slice(Math.max(0, from - 1), to),
    [ws.alteredSequence, from, to]
  );
  const windowedReference = useMemo(
    () => (ws.baseSequence ? ws.baseSequence.slice(Math.max(0, from - 1), to) : null),
    [ws.baseSequence, from, to]
  );

  const track = useMemo(() => {
    if (!ws.lastResult) return null;
    if (ws.lastResult.type === "simple") {
      const acceptor = flattenProbaTrack(ws.lastResult.data.acceptor_proba);
      const donor = flattenProbaTrack(ws.lastResult.data.donor_proba);
      return { label: "Baseline probability", acceptor, donor, valueKey: "values" };
    }
    if (ws.lastResult.type === "delta") {
      const acceptor = flattenDeltaTrack(ws.lastResult.data.acceptor_proba);
      const donor = flattenDeltaTrack(ws.lastResult.data.donor_proba);
      return { label: "Delta score", acceptor, donor, valueKey: "values" };
    }
    return null;
  }, [ws.lastResult]);

  const chartSlice = useMemo(() => {
    if (!track) return null;
    const inWindow = (p) => p + 1 >= from && p + 1 <= to;
    const positions = track.acceptor.positions.filter(inWindow);
    const sliceFor = (t) =>
      t.positions.map((p, i) => (inWindow(p) ? t.values[i] : null)).filter((v, i) => inWindow(t.positions[i]));
    return {
      labels: positions.map((p) => p + 1),
      acceptor: sliceFor(track.acceptor),
      donor: sliceFor(track.donor),
    };
  }, [track, from, to]);

  return html`
    <div class="panel dashboard-panel genome-track">
      <h3 class="panel__title">
        Genome Track
        <span class="field-row genome-track__zoom">
          <label class="genome-track__zoom-label">From
            <input type="number" min="1" value=${from} onInput=${(e) => setFrom(parseInt(e.currentTarget.value || "1", 10))} />
          </label>
          <label class="genome-track__zoom-label">To
            <input type="number" min="1" value=${to} onInput=${(e) => setTo(parseInt(e.currentTarget.value || "1", 10))} />
          </label>
        </span>
      </h3>
      <${SequenceTrack} sequence=${windowedSequence} reference=${windowedReference} highlightRanges=${highlightRanges} />
      ${track
        ? html`
            <div class="genome-track__chart">
              <p class="field-hint">${track.label} (acceptor gain / donor gain), current window</p>
              <${Chart}
                type="line"
                height=${180}
                labels=${chartSlice.labels}
                datasets=${[
                  { label: "Acceptor", data: chartSlice.acceptor, borderColor: "#60a5fa", pointRadius: 0, borderWidth: 1.5 },
                  { label: "Donor", data: chartSlice.donor, borderColor: "#fbbf24", pointRadius: 0, borderWidth: 1.5 },
                ]}
                sequence=${ws.alteredSequence}
              />
            </div>
          `
        : html`<p class="field-hint">Compute a baseline or delta score from the Point Mutations panel to overlay a probability track.</p>`}
    </div>
  `;
}
