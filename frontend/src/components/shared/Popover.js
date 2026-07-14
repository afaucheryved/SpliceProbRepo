import { html } from "../../lib/preact.js";

/**
 * A lightweight floating popover for chart data-point inspection.
 *
 * Shows:
 *   - Position (1-based biological convention)
 *   - Score for each dataset line at that position
 *   - ±10 bases of sequence context (with the clicked base highlighted)
 *
 * Props:
 *   x, y        — viewport (client) pixel coordinates of the click point
 *   position    — 1-based position in the sequence
 *   scores      — `[{ label, value }]` — one entry per dataset at this point
 *   sequence    — full DNA sequence string, for extracting ±10 context
 *   onClose     — callback to dismiss the popover
 */
export function Popover({ x, y, position, scores, sequence, onClose }) {
  // Compute the ±10 context window clamped to sequence bounds.
  const seqLen = sequence?.length ?? 0;
  const idx0 = Math.max(0, position - 1 - 10);
  const idx1 = Math.min(seqLen, position + 10);
  const contextBefore = sequence ? sequence.slice(idx0, position - 1) : "";
  const clickedBase = sequence ? sequence[position - 1] ?? "" : "";
  const contextAfter = sequence ? sequence.slice(position, idx1) : "";

  // Fixed-positioned at the click's viewport coordinates (clamped so the
  // popover stays fully on-screen near the right/bottom edges).
  return html`
    <div
      class="popover-overlay"
      onClick=${onClose}
      style=${"position:fixed;inset:0;z-index:999;background:transparent;"}
    ></div>
    <div
      class="popover"
      style=${`position:fixed;left:${Math.min(x, window.innerWidth - 320)}px;top:${Math.min(y, window.innerHeight - 200)}px;z-index:1000;`}
    >
      <div class="popover__header">
        <strong>Position ${position}</strong>
        <button type="button" class="popover__close" onClick=${onClose}>&times;</button>
      </div>
      <div class="popover__body">
        <table class="popover__scores">
          <tbody>
            ${scores.map(
              (s, i) => html`
                <tr key=${i}>
                  <td class="popover__label">${s.label}</td>
                  <td class="popover__value mono">${typeof s.value === "number" ? s.value.toFixed(6) : s.value}</td>
                </tr>
              `
            )}
          </tbody>
        </table>
        ${seqLen > 0
          ? html`
              <div class="popover__sequence">
                <span class="popover__seq-label">Context (±10):</span>
                <span class="popover__seq-context mono">
                  ${contextBefore}<strong class="popover__seq-base">${clickedBase}</strong>${contextAfter}
                </span>
                <div class="popover__seq-pos-hint">
                  <span>${position - contextBefore.length}</span>
                  <span class="popover__seq-pos-current">${position}</span>
                  <span>${position + contextAfter.length}</span>
                </div>
              </div>
            `
          : null}
      </div>
    </div>
  `;
}