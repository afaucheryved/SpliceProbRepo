import { html } from "../../lib/preact.js";
import { BLOCK_DEFINITIONS } from "./blockDefinitions.js";

const CATEGORIES = [...new Set(BLOCK_DEFINITIONS.map((b) => b.category))];

// Left-hand palette of available operations, CyberChef-style. Click to
// append to the recipe, or drag straight into the stack at a given
// position.
export function BlockLibrary({ onAdd }) {
  return html`
    <div class="block-library">
      ${CATEGORIES.map(
        (category) => html`
          <div class="block-library__group" key=${category}>
            <h4 class="block-library__category">${category}</h4>
            ${BLOCK_DEFINITIONS.filter((b) => b.category === category).map(
              (def) => html`
                <div
                  key=${def.id}
                  class="block-library__item"
                  draggable="true"
                  title=${def.summary}
                  onDragStart=${(e) => e.dataTransfer.setData("application/x-block-id", def.id)}
                  onClick=${() => onAdd(def.id)}
                >
                  <span class="block-library__label">${def.label}</span>
                  <span class="block-library__add">+</span>
                </div>
              `
            )}
          </div>
        `
      )}
    </div>
  `;
}
