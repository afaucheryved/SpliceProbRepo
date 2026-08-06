import { html, useState, useRef } from "../../lib/preact.js";
import { workspace, useWorkspace } from "../../lib/workspace.js";
import { parseFasta } from "../../lib/sequence.js";
import { ErrorBanner, Spinner } from "./Feedback.js";

const SAMPLE_SEQUENCE =
  "acgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgt";

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

// Shared sequence-loader / session indicator.
//
// "Load sequence" — changes the base sequence of the *current* session
// in-place (same session_id).  Disabled when there is no active session.
export function SessionBar({ compact = false }) {
  const ws = useWorkspace();
  const [draft, setDraft] = useState(ws.baseSequence || SAMPLE_SEQUENCE);
  const [draftName, setDraftName] = useState("workspace");
  const [fastaError, setFastaError] = useState(null);
  const [ensemblId, setEnsemblId] = useState("");
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

  async function handleEnsemblFetch(e) {
    e.preventDefault();
    const id = ensemblId.trim();
    if (!id) return;
    try {
      const sequence = await workspace.fetchEnsemblSequence(id);
      setDraft(sequence);
      setDraftName(id);
      await workspace.initSession(sequence, id);
    } catch {
      // surfaced via ws.lastError
    }
  }

  function handleFastaFile(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ""; // allow re-uploading the same filename later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const { name, sequence, error } = parseFasta(String(reader.result ?? ""));
      if (error) {
        setFastaError(error);
        return;
      }
      setFastaError(null);
      setDraft(sequence);
      setDraftName(name);
      try {
        await workspace.initSession(sequence, name);
      } catch {
        // surfaced via ws.lastError
      }
    };
    reader.onerror = () => setFastaError("Could not read the file.");
    reader.readAsText(file);
  }

  return html`
    <div class="session-bar ${compact ? "session-bar--compact" : ""}">
      <form class="session-bar__form">
        <button
          type="button"
          class="session-bar__copy-btn"
          title="Copy input sequence to clipboard"
          onClick=${() => copyToClipboard(draft)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <textarea
          class="session-bar__input mono"
          placeholder="Paste a raw ACGTN sequence…"
          value=${draft}
          onInput=${(e) => setDraft(e.currentTarget.value)}
          rows=${compact ? 2 : 3}
        ></textarea>
        <div class="session-bar__actions">
          <button
            type="button"
            class="btn"
            disabled=${ws.busy || !ws.sessionId}
            title=${ws.sessionId ? "Replace the current session's base sequence with the text above" : "No active session yet — load a FASTA file or fetch an Ensembl ID first"}
            onClick=${handleLoadSequence}
          >
            Load sequence
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
            title="Load a single-record FASTA (.txt) file to fill in the sequence above"
            onClick=${() => fileInputRef.current?.click()}
          >
            Load FASTA
          </button>
          <input
            type="text"
            class="session-bar__ensembl-input"
            placeholder="Ensembl ID…"
            value=${ensemblId}
            disabled=${ws.busy}
            onInput=${(e) => setEnsemblId(e.currentTarget.value)}
            onKeyDown=${(e) => {
              if (e.key === "Enter") handleEnsemblFetch(e);
            }}
          />
          <button
            type="button"
            class="btn"
            disabled=${ws.busy || !ensemblId.trim()}
            title="Fetch this Ensembl ID's sequence into the field above for review"
            onClick=${handleEnsemblFetch}
          >
            Fetch Ensembl
          </button>
          ${ws.busy ? html`<${Spinner} label="Contacting backend…" />` : null}
        </div>
      </form>
      <${ErrorBanner} message=${fastaError} onDismiss=${() => setFastaError(null)} />
      <${ErrorBanner} message=${ws.lastError} onDismiss=${() => workspace.clearError()} />
    </div>
  `;
}
