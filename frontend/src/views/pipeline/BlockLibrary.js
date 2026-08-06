import { html } from "../../lib/preact.js";
import { BLOCK_DEFINITIONS, categorySlug } from "./blockDefinitions.js";

// Fixed top-level order (SEQUENCE MODIFICATION, then SEQUENCE ANALYSIS) --
// not derived from BLOCK_DEFINITIONS' order, so the menu's structure stays
// stable regardless of how blocks are listed in the source file.
const SECTIONS = ["Sequence Modification", "Sequence Analysis"];

function categoriesInSection(section) {
  return [...new Set(BLOCK_DEFINITIONS.filter((b) => b.section === section).map((b) => b.category))];
}

// Left-hand palette of available operations, CyberChef-style. Click to
// append to the recipe, or drag straight into the stack at a given
// position. Two-level grouping: a section header (SEQUENCE MODIFICATION /
// SEQUENCE ANALYSIS), each with one or more category sub-headings.
export function BlockLibrary({ onAdd }) {
  return html`
    <div class="block-library">
      ${SECTIONS.map(
        (section) => html`
          <div class="block-library__section" key=${section}>
            <h3 class="block-library__section-title">${section}</h3>
            ${categoriesInSection(section).map(
              (category) => html`
                <div class="block-library__group" key=${category}>
                  <h4 class="block-library__category">${category}</h4>
                  ${BLOCK_DEFINITIONS.filter((b) => b.section === section && b.category === category).map(
                    (def) => html`
                      <div
                        key=${def.id}
                        class="block-library__item ${categorySlug(def.category) ? `block-library__item--${categorySlug(def.category)}` : ""}"
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
        `
      )}
    </div>
  `;
}
