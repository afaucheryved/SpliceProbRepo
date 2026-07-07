import { html, useState } from "../../../lib/preact.js";
import { workspace, useWorkspace } from "../../../lib/workspace.js";
import { buildMutation } from "../../../lib/sequence.js";

const BASES = ["a", "c", "g", "t"];

// Dense point-mutation editor: add/remove rows, then probe the backend for
// baseline or delta probabilities. Distinct from the Pipeline's recipe
// concept -- this is a single always-visible table, not a stackable block.
export function MutationManager() {
  const ws = useWorkspace();
  const [rows, setRows] = useState([]);

  const addRow = () => setRows((r) => [...r, { position: 1, ref: "a", alt: "c" }]);
  const updateRow = (i, patch) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));

  const mutationStrings = () => {
    const strings = rows.filter((r) => r.position && r.ref && r.alt).map((r) => buildMutation(r.position, r.ref, r.alt));
    return strings.length ? strings : [""];
  };

  return html`
    <div class="panel dashboard-panel">
      <h3 class="panel__title">Point Mutations</h3>
      <table class="data-table mutation-manager__table">
        <thead>
          <tr><th>Pos</th><th>Ref</th><th></th><th>Alt</th><th></th></tr>
        </thead>
        <tbody>
          ${rows.map(
            (row, i) => html`
              <tr key=${i}>
                <td>
                  <input
                    type="number"
                    min="1"
                    class="mutation-manager__pos"
                    value=${row.position}
                    onInput=${(e) => updateRow(i, { position: parseInt(e.currentTarget.value || "1", 10) })}
                  />
                </td>
                <td>
                  <select value=${row.ref} onChange=${(e) => updateRow(i, { ref: e.currentTarget.value })}>
                    ${BASES.map((b) => html`<option value=${b}>${b}</option>`)}
                  </select>
                </td>
                <td>→</td>
                <td>
                  <select value=${row.alt} onChange=${(e) => updateRow(i, { alt: e.currentTarget.value })}>
                    ${BASES.map((b) => html`<option value=${b}>${b}</option>`)}
                  </select>
                </td>
                <td><button type="button" class="btn btn--small btn--danger" onClick=${() => removeRow(i)}>✕</button></td>
              </tr>
            `
          )}
        </tbody>
      </table>
      <div class="field-row" style="margin-top:0.5rem">
        <button type="button" class="btn btn--small" onClick=${addRow}>+ Add mutation</button>
        <button
          type="button"
          class="btn btn--small btn--primary"
          disabled=${!ws.sessionId || ws.busy}
          onClick=${() => workspace.scoreDelta(mutationStrings()).catch(() => {})}
        >
          Compute Δ score
        </button>
        <button
          type="button"
          class="btn btn--small"
          disabled=${!ws.sessionId || ws.busy}
          onClick=${() => workspace.scoreSimple(mutationStrings()).catch(() => {})}
        >
          Compute baseline
        </button>
      </div>
      <p class="field-hint">
        Point mutations are scored against the current altered sequence but are not persisted into it (backend behavior).
      </p>
    </div>
  `;
}
