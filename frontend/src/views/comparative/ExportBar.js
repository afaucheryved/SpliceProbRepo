import { html } from "../../lib/preact.js";
import { downloadFile, toCsv } from "../../lib/sequence.js";

const CSV_COLUMNS = [
  { label: "position", value: (r) => r.position },
  { label: "mutation", value: (r) => r.mutation },
  { label: "acceptor_sum", value: (r) => r.acceptorSum },
  { label: "donor_sum", value: (r) => r.donorSum },
  { label: "score", value: (r) => r.totalAbs },
];

export function ExportBar({ rows }) {
  const exportable = rows.filter((r) => !r.error);
  return html`
    <div class="field-row">
      <button
        type="button"
        class="btn btn--small"
        disabled=${exportable.length === 0}
        onClick=${() => downloadFile("spliceprob_ranking.csv", toCsv(exportable, CSV_COLUMNS), "text/csv")}
      >
        Export CSV
      </button>
      <button
        type="button"
        class="btn btn--small"
        disabled=${exportable.length === 0}
        onClick=${() =>
          downloadFile(
            "spliceprob_ranking.json",
            JSON.stringify(exportable.map((r) => ({ ...r, resultData: undefined })), null, 2),
            "application/json"
          )}
      >
        Export JSON
      </button>
    </div>
  `;
}
