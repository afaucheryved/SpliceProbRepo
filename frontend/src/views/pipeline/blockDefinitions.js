// One block definition per backend endpoint. Each block's `fields` schema
// drives the generic BlockForm renderer; `run` executes the block against
// the shared workspace store and returns a normalized `{ kind, ... }`
// result that OutputPanel knows how to render.
import { api, MUTATION_MATRIX_BASES } from "../../api/client.js";
import { workspace } from "../../lib/workspace.js";
import { buildMutation } from "../../lib/sequence.js";

// Category -> CSS modifier slug, for the two categories that score/analyze
// rather than modify the sequence (Task 15). Index-based/Pattern-based/Random
// keep the default neutral styling (no slug).
const CATEGORY_SLUG = {
  Scoring: "scoring",
  Analysis: "analysis",
};

export function categorySlug(category) {
  return CATEGORY_SLUG[category] || "";
}

function identityMatrix() {
  return MUTATION_MATRIX_BASES.map((_, r) => MUTATION_MATRIX_BASES.map((_, c) => (r === c ? 1 : 0)));
}

function mutationsFromRows(rows) {
  const strings = (rows || [])
    .filter((r) => r.position && r.ref && r.alt)
    .map((r) => buildMutation(r.position, r.ref, r.alt));
  return strings.length ? strings : [""];
}

export const BLOCK_DEFINITIONS = [
  {
    id: "insert",
    category: "Index-based",
    label: "Insert Pattern",
    summary: "Place a pattern at an index, optionally overwriting a run of bases.",
    fields: [
      { key: "pattern", label: "Pattern (ACGT)", type: "sequence", default: "aaaa" },
      { key: "index", label: "Index (1-based)", type: "int", default: 1 },
      { key: "length", label: "Overwrite length (0 = pure insert)", type: "int", default: 0 },
    ],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration(`Insert "${params.pattern}" @${params.index}`, (sessionId) =>
        api.altByIndex.insert({ ...params, session_id: sessionId })
      ),
  },
  {
    id: "delete_index",
    category: "Index-based",
    label: "Delete by Index",
    summary: "Delete bases between start/end, or start + length, or start to the end.",
    fields: [
      { key: "start", label: "Start (1-based)", type: "int", default: 1 },
      {
        key: "mode",
        label: "Delete mode",
        type: "select",
        options: [
          { value: "end", label: "Start → End index" },
          { value: "length", label: "Start + length" },
          { value: "to-end", label: "Start → end of sequence" },
        ],
        default: "end",
      },
      { key: "end", label: "End (inclusive)", type: "int", default: 10, showIf: (p) => p.mode === "end" },
      { key: "length", label: "Length", type: "int", default: 10, showIf: (p) => p.mode === "length" },
    ],
    outputKind: "sequence",
    run: (params) => {
      const payload = { start: params.start, session_id: undefined };
      if (params.mode === "end") payload.end = params.end;
      else if (params.mode === "length") payload.length = params.length;
      return workspace.runAlteration(`Delete from ${params.start} (${params.mode})`, (sessionId) =>
        api.altByIndex.delete({ ...payload, session_id: sessionId })
      );
    },
  },
  {
    id: "move",
    category: "Index-based",
    label: "Move (Cut & Paste)",
    summary: "Cut a region [start_cc, end_cc] and paste it at index_paste.",
    fields: [
      { key: "start_cc", label: "Cut start (1-based)", type: "int", default: 1 },
      { key: "end_cc", label: "Cut end (exclusive)", type: "int", default: 5 },
      { key: "index_paste", label: "Paste index (1-based)", type: "int", default: 20 },
      { key: "length_paste", label: "Paste overwrite length (0 = non-destructive)", type: "int", default: 0 },
    ],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration(`Move ${params.start_cc}-${params.end_cc} → @${params.index_paste}`, (sessionId) =>
        api.altByIndex.move({ ...params, session_id: sessionId })
      ),
  },
  {
    id: "copy_paste",
    category: "Index-based",
    label: "Copy & Paste",
    summary: "Copy a region [start_cc, end_cc] and paste it at index_paste (source untouched).",
    fields: [
      { key: "start_cc", label: "Copy start (1-based)", type: "int", default: 1 },
      { key: "end_cc", label: "Copy end (exclusive)", type: "int", default: 5 },
      { key: "index_paste", label: "Paste index (1-based)", type: "int", default: 20 },
      { key: "length_paste", label: "Paste overwrite length (0 = non-destructive)", type: "int", default: 0 },
    ],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration(`Copy ${params.start_cc}-${params.end_cc} → @${params.index_paste}`, (sessionId) =>
        api.altByIndex.copyPaste({ ...params, session_id: sessionId })
      ),
  },
  {
    id: "replace_pattern",
    category: "Pattern-based",
    label: "Replace Pattern",
    summary: 'Regex-like replace. "_" = 1 base, "%(n)" = up to n bases, "%" = any length.',
    fields: [
      { key: "old", label: "Pattern to find", type: "text", default: "acgt" },
      { key: "new", label: "Replacement", type: "text", default: "tgca" },
    ],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration(`Replace "${params.old}" → "${params.new}"`, (sessionId) =>
        api.altByPattern.replace({ ...params, session_id: sessionId })
      ),
  },
  {
    id: "delete_pattern",
    category: "Pattern-based",
    label: "Delete Pattern",
    summary: "Delete every occurrence of a wildcard pattern.",
    fields: [{ key: "pattern", label: "Pattern", type: "text", default: "acgt" }],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration(`Delete pattern "${params.pattern}"`, (sessionId) =>
        api.altByPattern.delete({ ...params, session_id: sessionId })
      ),
  },
  {
    id: "random_mutate",
    category: "Random",
    label: "Random Mutation",
    summary: "Mutate every base independently using a 4×4 probability matrix (rows/cols = A,C,G,T).",
    fields: [{ key: "prob_mat", label: "Probability matrix", type: "matrix4x4", default: identityMatrix() }],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration("Random mutation (probability matrix)", (sessionId) =>
        api.mutateIndependently({ prob_mat: params.prob_mat, session_id: sessionId })
      ),
  },
  {
    id: "point_mutations_delta",
    category: "Scoring",
    label: "Point Mutations → Delta Score",
    summary: "Score explicit point substitutions against the baseline (does not persist into later blocks).",
    fields: [{ key: "rows", label: "Point mutations", type: "mutationList", default: [] }],
    outputKind: "delta",
    run: (params) => workspace.scoreDelta(mutationsFromRows(params.rows)),
  },
  {
    id: "point_mutations_simple",
    category: "Scoring",
    label: "Point Mutations → Baseline Probability",
    summary: "Baseline acceptor/donor splicing probability (renders as a chart, per the spec's output rule).",
    fields: [{ key: "rows", label: "Point mutations", type: "mutationList", default: [] }],
    outputKind: "proba",
    run: (params) => workspace.scoreSimple(mutationsFromRows(params.rows)),
  },
  {
    id: "tracked_alterations_simple",
    category: "Scoring",
    label: "Tracked Alterations → Baseline Probability",
    summary:
      "Baseline acceptor/donor splicing probability for every structural alteration performed so far in this session (one chart per tracked entry, most recent last).",
    fields: [],
    outputKind: "probaHistory",
    run: () => workspace.fetchAllSimpleProbas(),
  },
  {
    id: "zone_analysis",
    category: "Analysis",
    label: "Zone Analysis (PELT)",
    summary: "Detect high-impact regions and rank the most significant windowed mutation patterns within them.",
    fields: [
      { key: "step", label: "Step", type: "int", default: 5 },
      { key: "penality", label: "Penalty", type: "int", default: 2 },
      { key: "threshold", label: "Threshold (%)", type: "int", default: 20 },
      { key: "specified_models_used", label: "SpliceAI models used", type: "modelSet", default: [5] },
    ],
    outputKind: "zones",
    run: (params) => workspace.analyzeZones(params),
  },
];

export function blockById(id) {
  return BLOCK_DEFINITIONS.find((b) => b.id === id);
}

export function defaultParams(def) {
  const params = {};
  for (const field of def.fields) {
    params[field.key] = typeof field.default === "function" ? field.default() : structuredClone(field.default);
  }
  return params;
}
