import { html, useState } from "../../lib/preact.js";
import { workspace, useWorkspace } from "../../lib/workspace.js";
import { ErrorBanner, Spinner } from "./Feedback.js";

const SAMPLE_SEQUENCE =
  "acgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgt";

// Shared sequence-loader / session indicator, reused (with different CSS
// framing) across all three proposals so switching between them keeps the
// same session in view.
//
// Two distinct actions:
//   "Load sequence"  — changes the base sequence of the *current* session
//                      in-place (same session_id).  Disabled when there is
//                      no active session.
//   "Start new session" — always mints a brand-new session (new session_id).
export function SessionBar({ compact = false }) {
  const ws = useWorkspace();
  const [draft, setDraft] = useState(ws.baseSequence || SAMPLE_SEQUENCE);

  async function handleLoadSequence(e) {
    e.preventDefault();
    if (!ws.sessionId) return;
    try {
      await workspace.loadSequenceIntoSession(draft);
    } catch {
      // surfaced via ws.lastError
    }
  }

  async function handleNewSession(e) {
    e.preventDefault();
    try {
      await workspace.initSession(draft);
    } catch {
      // surfaced via ws.lastError
    }
  }

  return html`
    <div class="session-bar ${compact ? "session-bar--compact" : ""}">
      <form class="session-bar__form">
        <textarea
          class="session-bar__input mono"
          placeholder="Paste a raw ACGT sequence…"
          value=${draft}
          onInput=${(e) => setDraft(e.currentTarget.value)}
          rows=${compact ? 2 : 3}
        ></textarea>
        <div class="session-bar__actions">
          <button
            type="button"
            class="btn"
            disabled=${ws.busy || !ws.sessionId}
            title=${ws.sessionId ? "Replace the current session's base sequence with the text above" : "Load a sequence first to enable this action"}
            onClick=${handleLoadSequence}
          >
            Load sequence
          </button>
          <button
            type="button"
            class="btn btn--primary"
            disabled=${ws.busy}
            title="Create a brand-new session (current session data will be discarded)"
            onClick=${handleNewSession}
          >
            Start new session
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
