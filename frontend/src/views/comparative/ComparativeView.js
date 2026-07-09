import { html, useState } from "../../lib/preact.js";
import { SessionBar } from "../../components/shared/SessionBar.js";
import { SegmentedControl } from "../../components/shared/SegmentedControl.js";
import { ErrorBanner, Spinner } from "../../components/shared/Feedback.js";
import { useWorkspace } from "../../lib/workspace.js";
import { api } from "../../api/client.js";
import { isValidMutation, parseMutation, flattenDeltaTrack, flattenProbaTrack } from "../../lib/sequence.js";
import { DiffView } from "./DiffView.js";
import { RankingTable } from "./RankingTable.js";
import { ManhattanChart } from "./ManhattanChart.js";
import { DetailChart } from "./DetailChart.js";
import { ExportBar } from "./ExportBar.js";

const SAMPLE_BATCH = [
  ">p.1.a>c",
  ">p.4.t>a",
  ">p.10.c>a",
  ">p.5.a>g",
  ">p.8.t>c",
  ">p.15.c>t",
  ">p.20.g>a",
].join("\n");

const SOURCE_OPTIONS = [
  { value: "delta", label: "Batch mutations", hint: "Δ score per line" },
  { value: "proba", label: "Tracked alterations", hint: "baseline per session step" },
];

function sumAbs(values) {
  return values.reduce((a, v) => a + Math.abs(v), 0);
}

function sum(values) {
  return values.reduce((a, v) => a + v, 0);
}

// Tracked-alteration labels look like "3: insert:aaaa@12" or "5: delete:2" or
// "2: move:3-6->@10" -- best-effort pull out the position they acted on so
// they can share the ranking table / Manhattan chart x-axis with Δ-score
// rows. Operations with no inherent single position (replace, delete by
// pattern, random mutation) fall back to 0.
function positionFromTrackedLabel(label) {
  const withoutStep = label.replace(/^\d+:\s*/, "");
  const atMatches = withoutStep.match(/@(\d+)/g);
  if (atMatches && atMatches.length) return Number(atMatches[atMatches.length - 1].slice(1));
  const deleteMatch = withoutStep.match(/^delete:(\d+)/);
  if (deleteMatch) return Number(deleteMatch[1]);
  return 0;
}

// Proposal 3: a batch/comparative console. Instead of a live single
// sequence view, this scores many individual point mutations in isolation
// and ranks them by impact -- a workflow for triaging a variant list
// rather than iteratively editing one sequence.
export function ComparativeView() {
  const ws = useWorkspace();
  const [source, setSource] = useState("delta");
  const [batchText, setBatchText] = useState(SAMPLE_BATCH);
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [focusedIndex, setFocusedIndex] = useState(null);
  const [localError, setLocalError] = useState(null);

  const lines = batchText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const invalidLines = lines.filter((l) => !isValidMutation(l));

  function selectSource(next) {
    setSource(next);
    setRows([]);
    setFocusedIndex(null);
    setLocalError(null);
  }

  async function runBatch() {
    if (!ws.sessionId) {
      setLocalError("Load a sequence first (top bar).");
      return;
    }
    if (invalidLines.length) {
      setLocalError(`${invalidLines.length} line(s) do not match the ">p.<pos>.<ref>><alt>" syntax.`);
      return;
    }
    setLocalError(null);
    setRunning(true);
    setRows([]);
    setFocusedIndex(null);
    setProgress({ done: 0, total: lines.length });

    const accumulated = [];
    for (const mutation of lines) {
      try {
        const data = await api.getDeltaScore({
          name: ws.name,
          sequence: ws.baseSequence,
          mutations: [mutation],
          altered_sequence: "",
          session_id: ws.sessionId,
        });
        const acceptor = flattenDeltaTrack(data.acceptor_proba);
        const donor = flattenDeltaTrack(data.donor_proba);
        const acceptorSum = sumAbs(acceptor.values);
        const donorSum = sumAbs(donor.values);
        const parsed = parseMutation(mutation);
        accumulated.push({
          mutation,
          position: parsed?.position ?? 0,
          acceptorSum,
          donorSum,
          totalAbs: acceptorSum + donorSum,
          kind: "delta",
          resultData: data,
        });
      } catch (err) {
        const parsed = parseMutation(mutation);
        accumulated.push({ mutation, position: parsed?.position ?? 0, error: err.message || String(err) });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
      setRows([...accumulated]);
    }
    setRunning(false);
    setFocusedIndex(0);
  }

  // Alternate data source: baseline probability per alteration already
  // tracked in this session (GET /get/allsimpleprobas), rather than scoring
  // a user-typed batch of point mutations against the baseline.
  async function loadTrackedAlterations() {
    if (!ws.sessionId) {
      setLocalError("Load a sequence first (top bar).");
      return;
    }
    setLocalError(null);
    setRunning(true);
    setRows([]);
    setFocusedIndex(null);
    try {
      const data = await api.get.allSimpleProbas(ws.sessionId);
      const entries = Object.entries(data);
      setProgress({ done: entries.length, total: entries.length });
      const accumulated = entries.map(([label, entry]) => {
        const acceptor = flattenProbaTrack(entry.acceptor_proba);
        const donor = flattenProbaTrack(entry.donor_proba);
        const acceptorSum = sum(acceptor.values);
        const donorSum = sum(donor.values);
        return {
          mutation: label,
          position: positionFromTrackedLabel(label),
          acceptorSum,
          donorSum,
          totalAbs: acceptorSum + donorSum,
          kind: "proba",
          resultData: entry,
        };
      });
      setRows(accumulated);
      setFocusedIndex(accumulated.length ? 0 : null);
      if (accumulated.length === 0) {
        setLocalError("No alterations tracked yet in this session — run an index/pattern-based edit first (top bar or another proposal).");
      }
    } catch (err) {
      setLocalError(err.message || String(err));
    } finally {
      setRunning(false);
    }
  }

  return html`
    <div class="comparative-view">
      <div class="comparative-view__session">
        <${SessionBar} compact=${true} />
      </div>

      <div class="comparative-view__diff panel">
        <h3 class="panel__title">Reference vs. Altered Sequence</h3>
        <${DiffView} reference=${ws.baseSequence} altered=${ws.alteredSequence} />
      </div>

      <div class="comparative-view__batch panel">
        <div class="comparative-view__source-toggle">
          <h3 class="panel__title">Data Source</h3>
          <${SegmentedControl} options=${SOURCE_OPTIONS} value=${source} onChange=${selectSource} ariaLabel="Comparative data source" />
        </div>

        ${source === "delta"
          ? html`
              <textarea
                class="mono comparative-view__textarea"
                rows="6"
                value=${batchText}
                onInput=${(e) => setBatchText(e.currentTarget.value)}
                placeholder=${">p.8.a>c\n>p.15.c>t\n..."}
              ></textarea>
              <div class="field-row">
                <button type="button" class="btn btn--primary" disabled=${running || !ws.sessionId} onClick=${runBatch}>
                  ${running ? `Scoring ${progress.done}/${progress.total}…` : `Score ${lines.length} mutation(s)`}
                </button>
                ${running ? html`<${Spinner} label="Calling /GetDeltaScore/ per mutation…" />` : null}
                <${ExportBar} rows=${rows} />
              </div>
            `
          : html`
              <p class="field-hint">
                Loads baseline acceptor/donor probability for every structural alteration already performed in this
                session (GET /get/allsimpleprobas), instead of scoring a typed-in batch.
              </p>
              <div class="field-row">
                <button type="button" class="btn btn--primary" disabled=${running || !ws.sessionId} onClick=${loadTrackedAlterations}>
                  ${running ? "Loading…" : "Load tracked alterations"}
                </button>
                ${running ? html`<${Spinner} label="Calling /get/allsimpleprobas…" />` : null}
                <${ExportBar} rows=${rows} />
              </div>
            `}
        <${ErrorBanner} message=${localError} onDismiss=${() => setLocalError(null)} />
      </div>

      <div class="comparative-view__results">
        <div class="panel comparative-view__manhattan">
          <h3 class="panel__title">${source === "proba" ? "Signal Overview" : "Impact Overview"}</h3>
          <${ManhattanChart} rows=${rows} focusedIndex=${focusedIndex} onFocus=${setFocusedIndex} mode=${source} />
        </div>
        <div class="panel comparative-view__ranking scroll-y">
          <h3 class="panel__title">${source === "proba" ? "Ranked Alterations" : "Ranked Mutations"}</h3>
          <${RankingTable} rows=${rows} focusedIndex=${focusedIndex} onFocus=${setFocusedIndex} mode=${source} />
        </div>
        <div class="panel comparative-view__detail">
          <h3 class="panel__title">Detail</h3>
          <${DetailChart} row=${focusedIndex != null ? rows[focusedIndex] : null} />
        </div>
      </div>
    </div>
  `;
}
