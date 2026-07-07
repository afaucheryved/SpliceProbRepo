import { html } from "../../lib/preact.js";
import { baseColor } from "../../lib/sequence.js";

const ROW_WIDTH = 50;

// Paired reference/altered sequence diff, stacked rather than side-by-side
// panels -- a distinct visual paradigm from Proposal 1's single colored
// track and Proposal 2's zoomable genome track.
export function DiffView({ reference = "", altered = "" }) {
  if (!reference && !altered) {
    return html`<p class="field-hint">No sequence loaded yet.</p>`;
  }
  const len = Math.max(reference.length, altered.length);
  const rows = [];
  for (let start = 0; start < len; start += ROW_WIDTH) {
    rows.push(start);
  }

  return html`
    <div class="diff-view mono">
      ${rows.map((start) => {
        const refChunk = reference.slice(start, start + ROW_WIDTH);
        const altChunk = altered.slice(start, start + ROW_WIDTH);
        return html`
          <div class="diff-view__block" key=${start}>
            <div class="diff-view__gutter">${start + 1}</div>
            <div class="diff-view__lines">
              <div class="diff-view__line diff-view__line--ref">
                ${refChunk.split("").map((b, i) => html`<span key=${i} style=${`color:${baseColor(b)}`}>${b.toUpperCase()}</span>`)}
              </div>
              <div class="diff-view__line diff-view__line--alt">
                ${altChunk.split("").map((b, i) => {
                  const refBase = refChunk[i];
                  const changed = refBase != null && refBase.toLowerCase() !== b.toLowerCase();
                  return html`<span
                    key=${i}
                    class=${changed ? "diff-view__base--changed" : ""}
                    style=${`color:${baseColor(b)}`}
                  >${b.toUpperCase()}</span>`;
                })}
              </div>
            </div>
          </div>
        `;
      })}
    </div>
  `;
}
