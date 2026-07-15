import { html, useState } from "../../lib/preact.js";
import { BlockForm } from "./BlockForm.js";
import { categorySlug } from "./blockDefinitions.js";
import { parseTrackedAlterationDisplay } from "../../lib/sequence.js";

const STATUS_ICON = {
  idle: "○",
  running: "◐",
  success: "●",
  error: "✕",
  skipped: "—",
};

// A single stackable, draggable recipe card. Reordering is native HTML5
// drag-and-drop (no extra dependency) driven by the parent PipelineView.
export function RecipeBlock({ block, def, index, onParamsChange, onRemove, onToggle, onDropOnMutationList, onDropLibraryBlock, dragHandlers }) {
  const [collapsed, setCollapsed] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  // Only the "Tracked Alterations" block (probaHistory output) has a
  // per-entry breakdown worth expanding (Task 14) — its resultData is the
  // same label -> entry map GET /get/allsimpleprobas returns.
  const isExpandableSummary = def.outputKind === "probaHistory" && block.resultData && typeof block.resultData === "object";
  const trackedLabels = isExpandableSummary ? Object.keys(block.resultData) : [];

  const topSet = new Set();
  if (isExpandableSummary && block.params?.showTopOnly) {
    const topN = Math.max(1, block.params.topN || 5);
    const entries = Object.entries(block.resultData);
    const scored = entries.map(([label, entry]) => {
      const acceptor = entry?.delta_proba?.acceptor_proba;
      const donor = entry?.delta_proba?.donor_proba;
      let maxDelta = 0;
      if (acceptor) {
        for (const v of Object.values(acceptor)) {
          maxDelta = Math.max(maxDelta, Math.abs(v?.value ?? 0));
        }
      }
      if (donor) {
        for (const v of Object.values(donor)) {
          maxDelta = Math.max(maxDelta, Math.abs(v?.value ?? 0));
        }
      }
      return { label, maxDelta };
    });
    scored.sort((a, b) => b.maxDelta - a.maxDelta);
    for (const s of scored.slice(0, topN)) {
      topSet.add(s.label);
    }
  }
  return html`
    <div
      class="recipe-block ${block.enabled ? "" : "recipe-block--disabled"} ${dragHandlers.isOver ? "recipe-block--drop-target" : ""}"
      draggable="true"
      onDragStart=${(e) => dragHandlers.onDragStart(e, index)}
      onDragOver=${(e) => dragHandlers.onDragOver(e, index)}
      onDrop=${(e) => dragHandlers.onDrop(e, index)}
      onDragLeave=${dragHandlers.onDragLeave}
    >
      <div class="recipe-block__header">
        <span class="recipe-block__handle" title="Drag to reorder">⠿</span>
        <button
          type="button"
          class="recipe-block__collapse"
          title=${collapsed ? "Expand" : "Collapse"}
          onClick=${() => setCollapsed((c) => !c)}
        >
          ${collapsed ? "▶" : "▼"}
        </button>
        <span class="recipe-block__status recipe-block__status--${block.status}">${STATUS_ICON[block.status]}</span>
        <span class="recipe-block__title">${def.label}</span>
        <span class="recipe-block__category ${categorySlug(def.category) ? `recipe-block__category--${categorySlug(def.category)}` : ""}">${def.category}</span>
        <label class="recipe-block__toggle">
          <input type="checkbox" checked=${block.enabled} onChange=${() => onToggle(block.uid)} />
        </label>
        <button type="button" class="btn btn--small btn--danger" onClick=${() => onRemove(block.uid)}>✕</button>
      </div>
      ${!collapsed
        ? html`
            <p class="recipe-block__summary">${def.summary}</p>
            <${BlockForm} def=${def} params=${block.params} onChange=${(p) => onParamsChange(block.uid, p)} blockUid=${block.uid} onDropOnMutationList=${onDropOnMutationList} onDropLibraryBlock=${onDropLibraryBlock} />
            ${block.error ? html`<p class="recipe-block__error">⚠ ${block.error}</p>` : null}
            ${block.resultSummary
              ? isExpandableSummary
                ? html`
                    <button
                      type="button"
                      class="recipe-block__result recipe-block__result--expandable"
                      onClick=${() => setSummaryExpanded((v) => !v)}
                      title="Click to ${summaryExpanded ? "hide" : "show"} each tracked alteration"
                    >
                      ${summaryExpanded ? "▾" : "▸"} ${block.resultSummary}
                    </button>
                    ${summaryExpanded
                      ? html`
                          <ul class="recipe-block__tracked-list">
                            ${trackedLabels.map((label) => {
                              const entry = block.resultData[label];
                              const disp = parseTrackedAlterationDisplay(label, entry);
                              const isTop = topSet.has(label);
                              return html`<li key=${label} class="mono">
                                ${isTop
                                  ? html`<strong>${disp ? html`${disp.stepNum} : ${disp.opType} : ${disp.rangeText}` : label}</strong>`
                                  : (disp ? html`<strong>${disp.stepNum}</strong> : <strong>${disp.opType}</strong> : ${disp.rangeText}` : label)}
                              </li>`;
                            })}
                          </ul>
                        `
                      : null}
                  `
                : html`<p class="recipe-block__result">${block.resultSummary}</p>`
              : null}
          `
        : null}
    </div>
  `;
}
