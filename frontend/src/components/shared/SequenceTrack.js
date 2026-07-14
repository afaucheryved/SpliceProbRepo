import { html } from "../../lib/preact.js";
import { baseColor } from "../../lib/sequence.js";

const ROW_WIDTH = 60;
const MAX_RENDERED = 3000;

// Monospace FASTA-style sequence viewer: 60 bases/row, position gutter,
// optional per-base diff highlighting against `reference`, optional
// selection callback for click-to-pick-an-index workflows.
//
// `operations` is an optional Map from 0-based position index to a
// human-readable operation summary string (e.g. "Move 3-6 → @10").
// When a base is changed and has an associated operation, the hover
// title includes both the base diff and the operation summary.
export function SequenceTrack({ sequence = "", reference = null, onBaseClick = null, highlightRanges = [], operations = null }) {
  if (!sequence) {
    return html`<div class="sequence-track sequence-track--empty">No sequence loaded.</div>`;
  }

  const truncated = sequence.length > MAX_RENDERED;
  const display = truncated ? sequence.slice(0, MAX_RENDERED) : sequence;
  const rows = [];
  for (let start = 0; start < display.length; start += ROW_WIDTH) {
    rows.push(display.slice(start, start + ROW_WIDTH));
  }

  const inHighlight = (index) =>
    highlightRanges.some(([from, to]) => index >= from && index <= to);

  return html`
    <div class="sequence-track">
      ${rows.map((row, rowIdx) => {
        const rowStart = rowIdx * ROW_WIDTH;
        return html`
          <div class="sequence-track__row" key=${rowStart}>
            <span class="sequence-track__gutter">${rowStart + 1}</span>
            <span class="sequence-track__bases">
              ${row.split("").map((base, i) => {
                const index = rowStart + i;
                const refBase = reference ? reference[index] : null;
                const changed = refBase != null && refBase.toLowerCase() !== base.toLowerCase();
                const cls = [
                  "sequence-track__base",
                  changed ? "sequence-track__base--changed" : "",
                  inHighlight(index) ? "sequence-track__base--zone" : "",
                  onBaseClick ? "sequence-track__base--clickable" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const opTitle = operations?.get(index);
                const baseTitle = changed
                  ? `position ${index + 1}: ${refBase}→${base}`
                  : `position ${index + 1}`;
                const title = opTitle ? `${baseTitle} — ${opTitle}` : baseTitle;
                return html`
                  <span
                    key=${index}
                    class=${cls}
                    style=${`color:${baseColor(base)}`}
                    title=${title}
                    onClick=${onBaseClick ? () => onBaseClick(index, base) : null}
                  >${base.toUpperCase()}</span>
                `;
              })}
            </span>
          </div>
        `;
      })}
      ${truncated
        ? html`<div class="sequence-track__truncated">
            Showing first ${MAX_RENDERED.toLocaleString()} of ${sequence.length.toLocaleString()} bases.
          </div>`
        : null}
    </div>
  `;
}
