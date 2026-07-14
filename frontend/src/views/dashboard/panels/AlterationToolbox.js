import { html, useState } from "../../../lib/preact.js";
import { useWorkspace } from "../../../lib/workspace.js";
import { BlockForm } from "../../pipeline/BlockForm.js";
import { BLOCK_DEFINITIONS, blockById, defaultParams } from "../../pipeline/blockDefinitions.js";

// Structural alterations (index/pattern/random) reuse the same field
// schema as the Pipeline proposal's recipe blocks -- it is the same
// backend operation either way. Here it's exposed as an immediate-apply
// single-shot tool instead of a stackable recipe, which suits a
// researcher making one-off edits while inspecting live results.
const STRUCTURAL_IDS = BLOCK_DEFINITIONS.filter((b) => b.outputKind === "sequence").map((b) => b.id);

export function AlterationToolbox() {
  const ws = useWorkspace();
  const [selectedId, setSelectedId] = useState(STRUCTURAL_IDS[0]);
  const def = blockById(selectedId);
  const [params, setParams] = useState(defaultParams(def));

  function selectOperation(id) {
    setSelectedId(id);
    setParams(defaultParams(blockById(id)));
  }

  async function apply() {
    try {
      await def.run(params);
    } catch {
      /* surfaced via ws.lastError */
    }
  }

  return html`
    <div class="panel dashboard-panel">
      <h3 class="panel__title">Alteration Toolbox</h3>
      <div class="field">
        <label>Operation</label>
        <select value=${selectedId} onChange=${(e) => selectOperation(e.currentTarget.value)}>
          ${BLOCK_DEFINITIONS.filter((b) => STRUCTURAL_IDS.includes(b.id)).map(
            (b) => html`<option value=${b.id}>${b.label}</option>`
          )}
        </select>
      </div>
      <${BlockForm} def=${def} params=${params} onChange=${setParams} />
      <button type="button" class="btn btn--small btn--primary" disabled=${!ws.sessionId || ws.busy} onClick=${apply}>
        Apply to session
      </button>
    </div>
  `;
}
