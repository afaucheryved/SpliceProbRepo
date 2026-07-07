// Shared reactive workspace store used by all three frontend proposals.
// Switching the top-level segmented control does not reset this state, so a
// sequence/session loaded in one proposal is still there after switching to
// another -- that's what makes the 3-way toggle feel "seamless".
import { useEffect, useState } from "./preact.js";
import { api, ApiError } from "../api/client.js";
import { cleanSequence, isValidSequence } from "./sequence.js";

// --- Backend persistence quirks (verified by reading the FastAPI routers) ---
// The session's `altered_sequence` in Redis is ONLY ever updated by the
// structural alteration endpoints (/altbyindex/*, /altbypattern/*,
// /mutateindependently), via AlteredSequenceTrackerMixin._track_alteration().
// Those endpoints also return `null` (no `return` in the route handler), so
// the only way to observe their effect is a follow-up
// GET /get/alteredsequence call -- see `runAlteration()` below.
//
// /GetSimpleProb/, /GetDeltaScore/ and /resetgv apply their own `mutations`
// list *transiently*, in-memory, purely to compute that one response. They
// never write the mutated result back to the session. So point-mutation
// scoring blocks are best treated as read-only "probes" over whatever the
// session's altered_sequence currently is -- they will not chain into
// subsequent structural operations.

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
    setState({ lastError: message });
    pushHistory("error", message);
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

  // Starts a brand new Redis-backed session for `sequence`. This always
  // creates a fresh session_id (resetgv is called with session_id: null).
  async initSession(sequence, name = "workspace") {
    const clean = cleanSequence(sequence);
    if (!isValidSequence(clean)) {
      const err = new Error("Sequence must contain only A, C, G, T characters.");
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
    return withBusy(async () => {
      await apiCall(sessionId);
      const seq = await api.get.alteredSequence(sessionId);
      setState({ alteredSequence: seq });
      pushHistory("structural", label, { length: seq.length });
      return seq;
    });
  },

  // Point-mutation probe: does not mutate session state (see note above).
  async scoreSimple(mutations = [""]) {
    const sessionId = requireSession();
    return withBusy(async () => {
      const data = await api.getSimpleProb({
        name: state.name,
        sequence: state.baseSequence,
        mutations: mutations.length ? mutations : [""],
        altered_sequence: "",
        session_id: sessionId,
      });
      setState({ lastResult: { type: "simple", data } });
      pushHistory("probe", `Baseline probability (${mutations.filter(Boolean).length} mutation(s))`);
      return data;
    });
  },

  async scoreDelta(mutations = [""]) {
    const sessionId = requireSession();
    return withBusy(async () => {
      const data = await api.getDeltaScore({
        name: state.name,
        sequence: state.baseSequence,
        mutations: mutations.length ? mutations : [""],
        altered_sequence: "",
        session_id: sessionId,
      });
      setState({ lastResult: { type: "delta", data } });
      pushHistory("probe", `Delta score (${mutations.filter(Boolean).length} mutation(s))`);
      return data;
    });
  },

  async analyzeZones(params = {}) {
    const sessionId = requireSession();
    return withBusy(async () => {
      const data = await api.analysis.patternInZona({ ...params, session_id: sessionId });
      setState({ lastResult: { type: "zones", data } });
      pushHistory("probe", "Zone analysis (PELT)");
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
