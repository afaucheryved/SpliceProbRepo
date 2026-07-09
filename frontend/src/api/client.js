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

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(getApiBase() + path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
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
    simpleProba: (sessionId) => request("GET", "/get/simpleproba" + qs({ session_id: sessionId })),
    deltaProba: (sessionId) => request("GET", "/get/deltaproba" + qs({ session_id: sessionId })),
    mutations: (sessionId) => request("GET", "/get/mutations" + qs({ session_id: sessionId })),
    alteredSequence: (sessionId) => request("GET", "/get/alteredsequence" + qs({ session_id: sessionId })),
    // -> { "<n>: <mutation.human label>": { acceptor_proba, donor_proba, "altered sequence" }, ... }
    // One entry per tracked alteration in the session (see AlteredSequenceTrackerMixin),
    // in chronological order. The "<n>: " prefix disambiguates repeated labels
    // (e.g. two "mutate_independently" calls would otherwise collide).
    allSimpleProbas: (sessionId) => request("GET", "/get/allsimpleprobas" + qs({ session_id: sessionId })),
  },

  altByIndex: {
    // { start, end?, length?, session_id? } -- provide end XOR length, never both.
    delete: (payload) => request("POST", "/altbyindex/delete", payload),
    // { pattern, index, length, session_id? } -- length=0 means pure insert (no overwrite).
    insert: (payload) => request("POST", "/altbyindex/insert", payload),
    // { start_cc, end_cc, index_paste, length_paste, session_id? }
    move: (payload) => request("POST", "/altbyindex/move", payload),
    copyPaste: (payload) => request("POST", "/altbyindex/copypast", payload),
  },

  altByPattern: {
    // { old, new, session_id? } -- wildcards: '_' = 1 base, '%(n)' = up to n bases, '%' = any length.
    replace: (payload) => request("POST", "/altbypattern/replace", payload),
    // { pattern, session_id? }
    delete: (payload) => request("POST", "/altbypattern/delete", payload),
  },

  // { prob_mat: number[4][4] (rows/cols ordered A,C,G,T), simulated_phenomenon?, session_id? }
  mutateIndependently: (payload) => request("POST", "/mutateindependently", payload),

  analysis: {
    // { step?, penality?, threshold?, specified_models_used?, session_id? } -> { "(mut,...)": score }
    patternInZona: (payload) => request("POST", "/analysis/patterninzona", payload),
  },
};

// Row/column order of the 4x4 mutation probability matrix, per
// app/test/global_var.py GlobalVar.BASES = "acgt".
export const MUTATION_MATRIX_BASES = ["A", "C", "G", "T"];
