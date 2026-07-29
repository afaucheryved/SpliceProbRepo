import { h, html, useEffect, useRef } from "../../lib/preact.js";
import ChartJS from "https://esm.sh/chart.js@4.4.4/auto";
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

// rubber_window()'s response is now { analysis: [donorSegments, acceptorSegments],
// "sequence lenght": int, exon: [int, int] }, where each segment is
// { start, end, value, subsequence, type } -- the same top-N-by-impact-magnitude
// shape app/test/output_ploting/plot.py's build_segments() produces from the
// raw window dict, except the ranking/slicing now happens server-side
// (top_more_relevent) instead of client-side. Rendered as two elements, per
// spec: a raw-data table (grouped by type), and a ranked horizontal-bar chart
// where donor and acceptor segments are merged and sorted by signed score
// (not by type), with a "0 level" divider at the sign crossing and exon
// boundaries marked.
// Text color for the chart's hand-drawn annotations (boundary numbers, the
// zero-level line) -- reads the live `--app-fg` custom property so it
// tracks the dark/light theme toggle the same way seriesColors() does for
// the bar fills themselves.
function chartTextColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--app-fg").trim() || "#888";
}

// Registered as a per-instance plugin (not globally, unlike Chart.js's own
// verticalMarkerPlugin in components/shared/Chart.js) since it only applies
// to this one floating-bar chart shape -- mirrors plot.py's
// ax.axvline(exon[0]) / ax.axvline(exon[1]).
function exonBoundaryPlugin(exon) {
  return {
    id: "rubberWindowExonBoundary",
    afterDraw(chart) {
      if (!exon) return;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      if (!xScale || !yScale) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      [
        { value: exon[0], color: "#2563eb" },
        { value: exon[1], color: "#059669" },
      ].forEach(({ value, color }) => {
        const x = xScale.getPixelForValue(value);
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, yScale.top);
        ctx.lineTo(x, yScale.bottom);
        ctx.stroke();
      });
      ctx.restore();
    },
  };
}

// Draws the dashed "0 level" divider between the positive-score rows
// (segments ranked above it) and the negative-score rows (below it), once
// segments are sorted purely by signed score rather than grouped by type --
// `splitIndex` is the row index of the first negative-value segment.
// Skipped entirely when there's no such crossing (all rows same sign).
function zeroLevelPlugin(splitIndex, textColor) {
  return {
    id: "rubberWindowZeroLevel",
    afterDraw(chart) {
      if (splitIndex == null || splitIndex <= 0) return;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      if (!xScale || !yScale) return;
      const y = (yScale.getPixelForValue(splitIndex - 1) + yScale.getPixelForValue(splitIndex)) / 2;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = textColor;
      ctx.setLineDash([6, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xScale.left, y);
      ctx.lineTo(xScale.right, y);
      ctx.stroke();
      ctx.font = "10px sans-serif";
      ctx.fillStyle = textColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("0 level", xScale.left + 4, y - 2);
      ctx.restore();
    },
  };
}

// Annotates each bar in place: the window's start/end sequence coordinates
// flanking the bar (mirrors plot.py's boundary tick labels), and the masked
// window's replaced subsequence written inside the bar itself. A white halo
// behind the subsequence text keeps it legible against either the donor or
// acceptor fill color, in both themes.
function segmentAnnotationsPlugin(segments, textColor) {
  return {
    id: "rubberWindowSegmentLabels",
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      const xScale = chart.scales.x;
      if (!xScale || !meta) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "10px sans-serif";
      ctx.textBaseline = "middle";
      segments.forEach((seg, i) => {
        const bar = meta.data[i];
        if (!bar) return;
        const xStart = xScale.getPixelForValue(seg.start);
        const xEnd = xScale.getPixelForValue(seg.end);
        const y = bar.y;

        ctx.fillStyle = textColor;
        ctx.textAlign = "right";
        ctx.fillText(String(seg.start), xStart - 4, y);
        ctx.textAlign = "left";
        ctx.fillText(String(seg.end), xEnd + 4, y);

        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.strokeText(seg.subsequence, (xStart + xEnd) / 2, y);
        ctx.fillStyle = "#111";
        ctx.fillText(seg.subsequence, (xStart + xEnd) / 2, y);
      });
      ctx.restore();
    },
  };
}

// A dedicated (non-shared) Chart.js instance rather than the shared <Chart>
// wrapper: that wrapper's bar-chart path (aggregateBarSeries, click-to-popover)
// assumes one scalar value per category position on a vertical bar -- it
// doesn't fit this chart's floating (start, end) horizontal bars, and
// top_more_relevent already caps the row count so the 500-bar aggregation
// threshold it exists for isn't a concern here.
function RubberWindowChart({ donorSegments, acceptorSegments, sequenceLength, exon }) {
  const theme = useTheme();
  const colors = seriesColors(theme);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    // Ranked purely by signed score across both types combined -- not
    // grouped by donor/acceptor -- so the strongest positive-impact windows
    // cluster above the zero level and the strongest negative-impact ones
    // cluster below it (see zeroLevelPlugin).
    const segments = [...donorSegments, ...acceptorSegments].sort((a, b) => b.value - a.value);
    const splitIndex = segments.findIndex((seg) => seg.value < 0);

    // Y-axis labels show each row's score, not its type (color already
    // carries donor/acceptor) -- signed exponential so the crossing at the
    // "0 level" line reads directly off the axis.
    const rowLabels = segments.map((seg) => `${seg.value >= 0 ? "+" : ""}${seg.value.toExponential(2)}`);
    const barData = segments.map((seg) => [seg.start, seg.end]);
    const backgroundColor = segments.map((seg) => colors[seg.type]);
    const textColor = chartTextColor();

    chartRef.current = new ChartJS(canvasRef.current, {
      type: "bar",
      data: {
        labels: rowLabels,
        datasets: [{ label: "Window", data: barData, backgroundColor, borderWidth: 0 }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            min: 0,
            max: sequenceLength,
            title: { display: true, text: "Sequence position" },
          },
          y: { grid: { display: false }, title: { display: true, text: "Score" } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const seg = segments[item.dataIndex];
                if (!seg) return "";
                return [`[${seg.start}, ${seg.end}): ${seg.subsequence}`, `Δ ${seg.type} = ${seg.value.toExponential(3)}`];
              },
            },
          },
          // Same ctrl+scroll / pinch zoom, x-axis only, as the shared <Chart>
          // wrapper's histogram/line charts (see components/shared/Chart.js)
          // -- this chart can't use that wrapper (floating horizontal bars
          // don't fit its aggregateBarSeries assumptions) so the zoom config
          // and toolbar are duplicated here instead.
          zoom: {
            pan: { enabled: true, mode: "x" },
            zoom: {
              wheel: { enabled: true, modifierKey: "ctrl" },
              pinch: { enabled: true },
              drag: { enabled: false },
              mode: "x",
            },
          },
        },
      },
      plugins: [exonBoundaryPlugin(exon), zeroLevelPlugin(splitIndex, textColor), segmentAnnotationsPlugin(segments, textColor)],
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [donorSegments, acceptorSegments, sequenceLength, exon, theme]);

  const zoomIn = () => chartRef.current?.zoom(1.2);
  const zoomOut = () => chartRef.current?.zoom(0.8);
  const resetZoom = () => chartRef.current?.resetZoom();

  const rowCount = donorSegments.length + acceptorSegments.length;
  return h(
    "div",
    { style: "display:flex; flex-direction:column; gap:0.25rem;" },
    h(
      "div",
      { class: "chart-toolbar", style: "justify-content:flex-end;" },
      h("button", { type: "button", class: "chart-toolbar__btn", title: "Zoom out", onClick: zoomOut }, "−"),
      h("button", { type: "button", class: "chart-toolbar__btn", title: "Zoom in", onClick: zoomIn }, "+"),
      h("button", { type: "button", class: "chart-toolbar__btn", title: "Reset zoom", onClick: resetZoom }, "⌂")
    ),
    h("div", { style: `height:${Math.max(220, rowCount * 32)}px; position:relative;` }, h("canvas", { ref: canvasRef }))
  );
}

function RubberWindowLegend({ colors }) {
  const swatch = (color) => `display:inline-block;width:0.7rem;height:0.7rem;border-radius:2px;background:${color};margin-right:0.35rem;`;
  return html`
    <div style="display:flex; gap:1.25rem; align-items:center; font-size:0.85rem; margin:0.35rem 0 0.75rem;">
      <span><span style=${swatch(colors.donor)}></span>donor window</span>
      <span><span style=${swatch(colors.acceptor)}></span>acceptor window</span>
      <span><span style=${swatch("#2563eb")}></span>exon start (acceptor site)</span>
      <span><span style=${swatch("#059669")}></span>exon end (donor site)</span>
      <span>┅ 0 level (positive score above, negative below)</span>
    </div>
  `;
}

// 5 significant figures, e.g. 1.2345e-2 -- toExponential(sig - 1) puts
// (sig - 1) digits after the leading one.
function toSignificant(value, sig = 5) {
  return value.toExponential(sig - 1);
}

function RubberWindowTable({ rows }) {
  return html`
    <table class="data-table">
      <thead>
        <tr><th>Type</th><th>Rank</th><th>Start</th><th>End</th><th>Value</th><th>Subsequence</th></tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => html`
          <tr key=${i}>
            <td>${r.type}</td>
            <td>${r.rank}</td>
            <td>${r.start}</td>
            <td>${r.end}</td>
            <td>${toSignificant(r.value)}</td>
            <td class="mono">${r.subsequence}</td>
          </tr>
        `)}
      </tbody>
    </table>
  `;
}

function RubberWindowOutput({ data }) {
  const theme = useTheme();
  const colors = seriesColors(theme);
  const [donorSegments = [], acceptorSegments = []] = data?.analysis ?? [];
  const sequenceLength = data?.["sequence lenght"];
  const exon = data?.exon;

  if (donorSegments.length === 0 && acceptorSegments.length === 0) {
    return html`<p class="output-panel__hint">No windows produced — check the exon/interval/window settings.</p>`;
  }

  const rows = [
    ...donorSegments.map((seg, i) => ({ ...seg, rank: i + 1 })),
    ...acceptorSegments.map((seg, i) => ({ ...seg, rank: i + 1 })),
  ];

  return html`
    <div>
      <p class="output-panel__hint">
        Top ${donorSegments.length} donor and top ${acceptorSegments.length} acceptor windows, ranked together by signed
        score (not by type) -- the dashed "0 level" line marks where the score crosses from positive to negative. Each
        bar spans the masked ("N"-filled) window, with its start/end position flanking it and the replaced subsequence
        written inside; hover for the exact score delta.
      </p>
      <${RubberWindowChart} donorSegments=${donorSegments} acceptorSegments=${acceptorSegments} sequenceLength=${sequenceLength} exon=${exon} />
      <${RubberWindowLegend} colors=${colors} />
      <${RubberWindowTable} rows=${rows} />
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
      ${kind === "rubberWindow" ? html`<${RubberWindowOutput} data=${data} />` : null}
    `;
  }

  return html`
    <div class="output-panel">
      ${results.map((r, i) => renderResult(r, i))}
    </div>
  `;
}
