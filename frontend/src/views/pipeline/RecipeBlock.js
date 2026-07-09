import { html, useState } from "../../lib/preact.js";
import { BlockForm } from "./BlockForm.js";

const STATUS_ICON = {
  idle: "○",
  running: "◐",
  success: "●",
  error: "✕",
  skipped: "—",
};

// A single stackable, draggable recipe card. Reordering is native HTML5
// drag-and-drop (no extra dependency) driven by the parent PipelineView.
export function RecipeBlock({ block, def, index, onParamsChange, onRemove, onToggle, dragHandlers }) {
  const [collapsed, setCollapsed] = useState(false);
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
        <span class="recipe-block__category">${def.category}</span>
        <label class="recipe-block__toggle">
          <input type="checkbox" checked=${block.enabled} onChange=${() => onToggle(block.uid)} />
        </label>
        <button type="button" class="btn btn--small btn--danger" onClick=${() => onRemove(block.uid)}>✕</button>
      </div>
      ${!collapsed
        ? html`
            <p class="recipe-block__summary">${def.summary}</p>
            <${BlockForm} def=${def} params=${block.params} onChange=${(p) => onParamsChange(block.uid, p)} />
            ${block.error ? html`<p class="recipe-block__error">⚠ ${block.error}</p>` : null}
            ${block.resultSummary ? html`<p class="recipe-block__result">${block.resultSummary}</p>` : null}
          `
        : null}
    </div>
  `;
}
