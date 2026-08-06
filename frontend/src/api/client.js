// Thin fetch wrapper around every SpliceProb backend endpoint.
//
// Request/response shapes below mirror the Pydantic models exactly (see
// app/router/*.py and app/schemas/*.py in the backend). Two backend quirks
// this client works around:
//
//  1. All alteration endpoints (/altbyindex/*, /altbypattern/*,
//     /mutateindependently) have NO return statement in their FastAPI route
//     -- they respond with `null`. The only way to observe the result is a
//     follow-up GET /get/alteredsequence?session_id=... call. See
//     workspace.js `runAlteration()` for the call+refetch pattern.
//  2. `session_id` is only ever returned in the JSON body by
//     /GetSimpleProb/, /GetDeltaScore/ and /resetgv. Every other endpoint
//     requires session_id as an *input* and stays silent about it.

const STORAGE_KEY = "spliceprob:apiBase";

export function getApiBase() {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setApiBase(url) {
  localStorage.setItem(STORAGE_KEY, url ?? "");
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

const WS_BASE = "ws://127.0.0.1:8000";

export function setWsBase(url) {
  // stored alongside apiBase for convenience
}

export function rubberWindowWs(payload, onMessage, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const wsUrl = (getApiBase() || "http://127.0.0.1:8000").replace(/^http/, "ws") + "/ws/rubber-window";
    const ws = new WebSocket(wsUrl);

    const closeWs = () => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error("Cancelled"));
      }
    };

    if (signal) {
      if (signal.aborted) {
        closeWs();
        return;
      }
      signal.addEventListener("abort", closeWs, { once: true });
    }

    ws.onopen = () => {
      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      onMessage(msg);
      if (msg.type === "complete") {
        settled = true;
        if (signal) signal.removeEventListener("abort", closeWs);
        ws.close();
        resolve(msg.data);
      } else if (msg.type === "error") {
        settled = true;
        if (signal) signal.removeEventListener("abort", closeWs);
        ws.close();
        reject(new Error(msg.message || "WebSocket operation failed"));
      } else if (msg.type === "cancelled") {
        settled = true;
        if (signal) signal.removeEventListener("abort", closeWs);
        ws.close();
        reject(new Error("Cancelled"));
      }
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        if (signal) signal.removeEventListener("abort", closeWs);
        reject(new Error("WebSocket connection error"));
      }
    };

    ws.onclose = (e) => {
      if (!settled) {
        settled = true;
        if (signal) signal.removeEventListener("abort", closeWs);
        reject(new Error(`WebSocket closed unexpectedly (code ${e.code})`));
      }
    };
  });
}

async function request(method, path, body, signal) {
  let res;
  try {
    res = await fetch(getApiBase() + path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (networkErr) {
    if (networkErr.name === "AbortError") {
      throw new ApiError("Cancelled", 0, null);
    }
    throw new ApiError(
      `Network error reaching ${path}. Is the backend running and served through frontend/serve.py? (${networkErr.message})`,
      0,
      null
    );
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const detail =
      (data && typeof data === "object" && (data.detail || data.message)) ||
      (typeof data === "string" ? data : null) ||
      `HTTP ${res.status}`;
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status, data);
  }
  return data;
}

const qs = (params) =>
  "?" +
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

export const api = {
  // POST /GetSimpleProb/  body: GeneticVariant -> { acceptor_proba, donor_proba, "altered sequence", session_id }
  getSimpleProb: (payload) => request("POST", "/GetSimpleProb/", payload),

  // POST /GetDeltaScore/  body: GeneticVariant -> { acceptor_proba, donor_proba, "altered sequence", name, session_id }
  getDeltaScore: (payload) => request("POST", "/GetDeltaScore/", payload),

  // POST /resetgv  body: {name, sequence, mutations, altered_sequence, session_id} -> {session_id, status}
  resetGv: (payload) => request("POST", "/resetgv", payload),

  get: {
    sequence: (sessionId) => request("GET", "/get/sequence" + qs({ session_id: sessionId })),
    gv: (sessionId) => request("GET", "/get/gv" + qs({ session_id: sessionId })),
    simpleProba: (sessionId, signal) => request("GET", "/get/simpleproba" + qs({ session_id: sessionId }), undefined, signal),
    deltaProba: (sessionId) => request("GET", "/get/deltaproba" + qs({ session_id: sessionId })),
    mutations: (sessionId) => request("GET", "/get/mutations" + qs({ session_id: sessionId })),
    alteredSequence: (sessionId, signal) => request("GET", "/get/alteredsequence" + qs({ session_id: sessionId }), undefined, signal),
    // -> { "<n>: <mutation.human label>": { acceptor_proba, donor_proba, "altered sequence" }, ... }
    // One entry per tracked alteration in the session (see AlteredSequenceTrackerMixin),
    // in chronological order. The "<n>: " prefix disambiguates repeated labels
    // (e.g. two "mutate_independently" calls would otherwise collide).
    allSimpleProbas: (sessionId, signal) => request("GET", "/get/allsimpleprobas" + qs({ session_id: sessionId }), undefined, signal),
  },

  altByIndex: {
    // { start, end?, length?, session_id? } -- provide end XOR length, never both.
    delete: (payload, signal) => request("POST", "/altbyindex/delete", payload, signal),
    // { pattern, index, length, session_id? } -- length=0 means pure insert (no overwrite).
    insert: (payload, signal) => request("POST", "/altbyindex/insert", payload, signal),
    // { start_cc, end_cc, index_paste, length_paste, session_id? }
    move: (payload, signal) => request("POST", "/altbyindex/move", payload, signal),
    copyPaste: (payload, signal) => request("POST", "/altbyindex/copypast", payload, signal),
  },

  altByPattern: {
    // { old, new, session_id? } -- wildcards: '_' = 1 base, '%(n)' = up to n bases, '%' = any length.
    replace: (payload, signal) => request("POST", "/altbypattern/replace", payload, signal),
    // { pattern, session_id? }
    delete: (payload, signal) => request("POST", "/altbypattern/delete", payload, signal),
  },

  // { prob_mat: number[4][4] (rows/cols ordered A,C,G,T), simulated_phenomenon?, session_id? }
  mutateIndependently: (payload, signal) => request("POST", "/mutateindependently", payload, signal),

  analysis: {
    // { step?, penality?, threshold?, specified_models_used?, session_id? } -> { "(mut,...)": score }
    patternInZona: (payload) => request("POST", "/analysis/patterninzona", payload),
  },

  ensembl: {
    // { ensembl_id, session_id? } -> { session_id, status }. Does not return
    // the sequence text itself -- follow up with GET /get/sequence(session_id).
    get: (payload) => request("POST", "/ensembl/get", payload),
  },
};

// Row/column order of the 4x4 mutation probability matrix, per
// app/test/global_var.py GlobalVar.BASES = "acgt".
export const MUTATION_MATRIX_BASES = ["A", "C", "G", "T"];
