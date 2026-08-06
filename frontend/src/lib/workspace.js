// Shared reactive workspace store used by the pipeline view.
import { useEffect, useState } from "./preact.js";
import { api, ApiError, rubberWindowWs } from "../api/client.js";
import { cleanSequence, isValidSequence } from "./sequence.js";

// --- Backend persistence quirks (verified by reading the FastAPI routers) ---
// The session's `altered_sequence` in Redis is ONLY ever updated by the
// structural alteration endpoints (/altbyindex/*, /altbypattern/*,
// /mutateindependently), via AlteredSequenceTrackerMixin._track_alteration().
// Those endpoints also return `null` (no `return` in the route handler), so
// the only way to observe their effect is a follow-up
// GET /get/alteredsequence call -- see `runAlteration()` below.

let state = {
  name: "workspace",
  baseSequence: "",
  sessionId: null,
  alteredSequence: "",
  history: [], // { id, ts, kind: 'init'|'structural'|'probe'|'error', label, detail? }
  lastResult: null, // { type: 'simple'|'delta'|'zones', data }
  lastError: null,
  busy: false,
};

const listeners = new Set();

function setState(patch) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((fn) => fn(state));
}

let historySeq = 0;
let _cancelController = null;

function _activeSignal() {
  return _cancelController?.signal;
}
function pushHistory(kind, label, detail) {
  setState((s) => ({
    history: [...s.history, { id: ++historySeq, kind, label, detail, at: new Date().toISOString() }],
  }));
}

function requireSession() {
  if (!state.sessionId) {
    throw new Error("No active session yet. Load a sequence first.");
  }
  return state.sessionId;
}

async function withBusy(fn) {
  setState({ busy: true, lastError: null });
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof ApiError ? err.message : err.message || String(err);
    if (message !== "Cancelled") {
      setState({ lastError: message });
      pushHistory("error", message);
    }
    throw err;
  } finally {
    setState({ busy: false });
  }
}

export const workspace = {
  getState: () => state,

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  startCancelSession() {
    _cancelController = new AbortController();
    return _cancelController.signal;
  },

  cancelAll() {
    if (_cancelController) {
      _cancelController.abort();
      _cancelController = null;
    }
  },

  clearCancelSession() {
    _cancelController = null;
  },

  // Starts a brand new Redis-backed session for `sequence`. This always
  // creates a fresh session_id (resetgv is called with session_id: null).
  async initSession(sequence, name = "workspace") {
    const clean = cleanSequence(sequence);
    if (!isValidSequence(clean)) {
      const err = new Error("Sequence must contain only A, C, G, T, N characters.");
      setState({ lastError: err.message });
      throw err;
    }
    return withBusy(async () => {
      const result = await api.resetGv({
        name,
        sequence: clean,
        mutations: [""],
        altered_sequence: "",
        session_id: null,
      });
      setState({
        name,
        baseSequence: clean,
        sessionId: result.session_id,
        alteredSequence: clean,
        history: [],
        lastResult: null,
      });
      pushHistory("init", `Session started (${clean.length} bp)`, { session_id: result.session_id });
      return result;
    });
  },

  // Changes the base sequence of the *current* session in-place, without
  // creating a new session_id. Calls POST /resetgv with the existing
  // session_id and new sequence (Task 5's in-place-reset path).
  async loadSequenceIntoSession(sequence, name = "workspace") {
    const clean = cleanSequence(sequence);
    if (!isValidSequence(clean)) {
      const err = new Error("Sequence must contain only A, C, G, T, N characters.");
      setState({ lastError: err.message });
      throw err;
    }
    const sessionId = requireSession();
    return withBusy(async () => {
      const result = await api.resetGv({
        name,
        sequence: clean,
        mutations: [""],
        altered_sequence: "",
        session_id: sessionId,
      });
      setState({
        name,
        baseSequence: clean,
        alteredSequence: clean,
        lastResult: null,
      });
      pushHistory("init", `Sequence loaded into session (${clean.length} bp)`, { session_id: sessionId });
      return result;
    });
  },

  // Resets the current session's altered sequence back to the base sequence,
  // clearing all tracked alteration history — without changing the session_id
  // or the base sequence itself. Used by the Pipeline's "Bake" to ensure each
  // bake starts from a clean slate (Task 7).
  async resetSession() {
    const sessionId = requireSession();
    const base = state.baseSequence;
    if (!base) throw new Error("No base sequence loaded.");
    return withBusy(async () => {
      const result = await api.resetGv({
        name: state.name,
        sequence: base,
        mutations: [""],
        altered_sequence: "",
        session_id: sessionId,
      });
      setState({
        alteredSequence: base,
        lastResult: null,
      });
      pushHistory("init", "Session reset for re-bake");
      return result;
    });
  },

  // Fetches a sequence from Ensembl by ID and returns the raw sequence text
  // (item 4). Deliberately does NOT touch the current session/base sequence
  // -- the returned session_id from POST /ensembl/get is discarded once the
  // sequence text has been read back, so the caller can drop the text into a
  // draft textarea for review/edit, exactly like a pasted or FASTA-uploaded
  // sequence, before explicitly "Load sequence"-ing or starting a new session.
  //
  // Always omits session_id from the request (even if a session is already
  // active) so the backend mints a fresh throwaway session for the fetch --
  // verified live that passing an *existing* session_id here returns
  // {status: "new_sequence_from_ensembl"} without actually updating that
  // session's stored sequence, silently leaving GET /get/sequence pointed at
  // the old text. Requesting a brand-new session every time sidesteps that.
  async fetchEnsemblSequence(ensemblId) {
    return withBusy(async () => {
      const { session_id } = await api.ensembl.get({ ensembl_id: ensemblId });
      return api.get.sequence(session_id);
    });
  },

  async refreshAlteredSequence() {
    const sessionId = requireSession();
    return withBusy(async () => {
      const seq = await api.get.alteredSequence(sessionId);
      setState({ alteredSequence: seq });
      return seq;
    });
  },

  // Runs a structural alteration endpoint (returns null by design) then
  // re-fetches the resulting altered_sequence so the UI can show the effect.
  async runAlteration(label, apiCall) {
    const sessionId = requireSession();
    const signal = _activeSignal();
    return withBusy(async () => {
      await apiCall(sessionId, signal);
      const seq = await api.get.alteredSequence(sessionId, signal);
      setState({ alteredSequence: seq });
      pushHistory("structural", label, { length: seq.length });
      return seq;
    });
  },

  // Absolute baseline probability of the sequence as it stands right now in
  // this session (i.e. after whatever structural blocks ran earlier in the
  // recipe) -- read-only, does not mutate session state.
  async fetchCurrentSimpleProba() {
    const sessionId = requireSession();
    const signal = _activeSignal();
    return withBusy(async () => {
      const data = await api.get.simpleProba(sessionId, signal);
      setState({ lastResult: { type: "simple", data } });
      pushHistory("probe", "Baseline probability (current sequence)");
      return data;
    });
  },

  // Delta/baseline probability for every alteration tracked so far in this
  // session (one entry per successful /altbyindex/*, /altbypattern/* or
  // /mutateindependently call) -- read-only, does not mutate session state.
  async fetchAllSimpleProbas() {
    const sessionId = requireSession();
    const signal = _activeSignal();
    return withBusy(async () => {
      const data = await api.get.allSimpleProbas(sessionId, signal);
      setState({ lastResult: { type: "probaHistory", data } });
      pushHistory("probe", `Delta/baseline probabilities for ${Object.keys(data).length} tracked alteration(s)`);
      return data;
    });
  },

  async fetchDeltaProba() {
    const sessionId = requireSession();
    const signal = _activeSignal();
    return withBusy(async () => {
      const data = await api.get.deltaProba(sessionId, signal);
      const result = {
        "All modifications applied": {
          delta_proba: data,
          "altered sequence": state.alteredSequence,
        },
      };
      setState({ lastResult: { type: "probaHistory", data: result } });
      pushHistory("probe", "Delta score (all modifications vs. base sequence)");
      return result;
    });
  },

  async rubberWindow(params = {}, onProgress) {
    const sessionId = requireSession();
    return withBusy(async () => {
      const data = await rubberWindowWs(
        { ...params, session_id: sessionId },
        (msg) => {
          if (onProgress) onProgress(msg);
          if (msg.type === "progress") {
            setState({ progressTime: Date.now() });
          }
        },
        _activeSignal(),
      );
      setState({ lastResult: { type: "rubberWindow", data } });
      pushHistory("probe", "Rubber window analysis");
      return data;
    });
  },

  clearError() {
    setState({ lastError: null });
  },
};

// Preact hook: re-renders the calling component whenever the store changes.
export function useWorkspace() {
  const [, setTick] = useState(0);
  useEffect(() => workspace.subscribe(() => setTick((t) => t + 1)), []);
  return workspace.getState();
}
