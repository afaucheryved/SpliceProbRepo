import { html, useState, useMemo } from "../../lib/preact.js";

const COLUMN_LABELS = {
  delta: { acceptorSum: "Σ|Δ| acceptor", donorSum: "Σ|Δ| donor", totalAbs: "Impact" },
  proba: { acceptorSum: "Σ acceptor proba", donorSum: "Σ donor proba", totalAbs: "Signal" },
};

function columnsFor(mode) {
  const labels = COLUMN_LABELS[mode] ?? COLUMN_LABELS.delta;
  return [
    { key: "position", label: "Pos" },
    { key: "mutation", label: "Mutation" },
    { key: "acceptorSum", label: labels.acceptorSum },
    { key: "donorSum", label: labels.donorSum },
    { key: "totalAbs", label: labels.totalAbs },
  ];
}

export function RankingTable({ rows, focusedIndex, onFocus, mode = "delta" }) {
  const COLUMNS = columnsFor(mode);
  const [sortKey, setSortKey] = useState("totalAbs");
  const [sortDir, setSortDir] = useState(-1);

  const sorted = useMemo(() => {
    const withIndex = rows.map((r, i) => ({ ...r, __i: i }));
    return withIndex.sort((a, b) => (a[sortKey] > b[sortKey] ? sortDir : a[sortKey] < b[sortKey] ? -sortDir : 0));
  }, [rows, sortKey, sortDir]);

  function toggleSort(key) {
    if (key === sortKey) setSortDir((d) => -d);
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  return html`
    <table class="data-table ranking-table">
      <thead>
        <tr>
          ${COLUMNS.map(
            (c) => html`<th key=${c.key} onClick=${() => toggleSort(c.key)}>${c.label} ${sortKey === c.key ? (sortDir === -1 ? "↓" : "↑") : ""}</th>`
          )}
        </tr>
      </thead>
      <tbody>
        ${sorted.map(
          (row) => html`
            <tr
              key=${row.__i}
              class=${row.__i === focusedIndex ? "ranking-table__row--focused" : ""}
              onClick=${() => onFocus(row.__i)}
            >
              <td>${row.position}</td>
              <td class="mono">${row.mutation}${row.error ? html` <span class="ranking-table__error" title=${row.error}>⚠</span>` : null}</td>
              <td>${row.error ? "—" : row.acceptorSum.toFixed(4)}</td>
              <td>${row.error ? "—" : row.donorSum.toFixed(4)}</td>
              <td><strong>${row.error ? "—" : row.totalAbs.toFixed(4)}</strong></td>
            </tr>
          `
        )}
      </tbody>
    </table>
    ${rows.length === 0 ? html`<p class="field-hint">Run a batch to populate the ranking.</p>` : null}
  `;
}
