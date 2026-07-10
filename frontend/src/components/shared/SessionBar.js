import { html, useState, useRef } from "../../lib/preact.js";
import { workspace, useWorkspace } from "../../lib/workspace.js";
import { parseFasta } from "../../lib/sequence.js";
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
  const [draftName, setDraftName] = useState("workspace");
  const [fastaError, setFastaError] = useState(null);
  const fileInputRef = useRef(null);

  async function handleLoadSequence(e) {
    e.preventDefault();
    if (!ws.sessionId) return;
    try {
      await workspace.loadSequenceIntoSession(draft, draftName);
    } catch {
      // surfaced via ws.lastError
    }
  }

  async function handleNewSession(e) {
    e.preventDefault();
    try {
      await workspace.initSession(draft, draftName);
    } catch {
      // surfaced via ws.lastError
    }
  }

  function handleFastaFile(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ""; // allow re-uploading the same filename later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { name, sequence, error } = parseFasta(String(reader.result ?? ""));
      if (error) {
        setFastaError(error);
        return;
      }
      setFastaError(null);
      setDraft(sequence);
      setDraftName(name);
    };
    reader.onerror = () => setFastaError("Could not read the file.");
    reader.readAsText(file);
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
            title=${ws.sessionId ? "Replace the current session's base sequence with the text above" : "No active session yet — click 'Start new session' first"}
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
          <input
            ref=${fileInputRef}
            type="file"
            accept=".txt,.fasta,.fa"
            class="session-bar__file-input"
            onChange=${handleFastaFile}
          />
          <button
            type="button"
            class="btn"
            disabled=${ws.busy}
            title="Upload a single-record FASTA (.txt) file to fill in the sequence above"
            onClick=${() => fileInputRef.current?.click()}
          >
            Upload FASTA…
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
      <${ErrorBanner} message=${fastaError} onDismiss=${() => setFastaError(null)} />
      <${ErrorBanner} message=${ws.lastError} onDismiss=${() => workspace.clearError()} />
    </div>
  `;
}
