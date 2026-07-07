import { html, useState } from "../../lib/preact.js";
import { workspace, useWorkspace } from "../../lib/workspace.js";
import { ErrorBanner, Spinner } from "./Feedback.js";

const SAMPLE_SEQUENCE =
  "acgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgt";

// Shared sequence-loader / session indicator, reused (with different CSS
// framing) across all three proposals so switching between them keeps the
// same session in view.
export function SessionBar({ compact = false }) {
  const ws = useWorkspace();
  const [draft, setDraft] = useState(ws.baseSequence || SAMPLE_SEQUENCE);

  async function handleLoad(e) {
    e.preventDefault();
    try {
      await workspace.initSession(draft);
    } catch {
      // surfaced via ws.lastError
    }
  }

  return html`
    <div class="session-bar ${compact ? "session-bar--compact" : ""}">
      <form class="session-bar__form" onSubmit=${handleLoad}>
        <textarea
          class="session-bar__input mono"
          placeholder="Paste a raw ACGT sequence…"
          value=${draft}
          onInput=${(e) => setDraft(e.currentTarget.value)}
          rows=${compact ? 2 : 3}
        ></textarea>
        <div class="session-bar__actions">
          <button type="submit" class="btn btn--primary" disabled=${ws.busy}>
            ${ws.sessionId ? "Start new session" : "Load sequence"}
          </button>
          ${ws.busy ? html`<${Spinner} label="Contacting backend…" />` : null}
          ${ws.sessionId
            ? html`
                <span class="session-bar__meta" title=${ws.sessionId}>
                  session <code>${ws.sessionId.slice(0, 8)}…</code>
                </span>
                <span class="session-bar__meta">${ws.baseSequence.length.toLocaleString()} bp</span>
              `
            : null}
        </div>
      </form>
      <${ErrorBanner} message=${ws.lastError} onDismiss=${() => workspace.clearError()} />
    </div>
  `;
}
