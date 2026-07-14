import { html } from "../../lib/preact.js";

// The 3-position toggle switch required by the spec: swaps between the
// three frontend proposals without a page reload.
export function SegmentedControl({ options, value, onChange, ariaLabel = "Frontend proposal" }) {
  return html`
    <div class="segmented-control" role="tablist" aria-label=${ariaLabel}>
      ${options.map(
        (opt) => html`
          <button
            key=${opt.value}
            type="button"
            role="tab"
            aria-selected=${opt.value === value}
            class="segmented-control__option ${opt.value === value ? "is-active" : ""}"
            onClick=${() => onChange(opt.value)}
          >
            <span class="segmented-control__label">${opt.label}</span>
            ${opt.hint ? html`<span class="segmented-control__hint">${opt.hint}</span>` : null}
          </button>
        `
      )}
    </div>
  `;
}
