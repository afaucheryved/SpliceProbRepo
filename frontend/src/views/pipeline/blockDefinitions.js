// One block definition per backend endpoint. Each block's `fields` schema
// drives the generic BlockForm renderer; `run` executes the block against
// the shared workspace store and returns a normalized `{ kind, ... }`
// result that OutputPanel knows how to render.
//
// `section` drives the OPERATION menu's top-level grouping (Sequence
// Modification / Sequence Analysis); `category` is the menu's sub-heading
// within that section and also the badge shown on a recipe card.
import { api, MUTATION_MATRIX_BASES } from "../../api/client.js";
import { workspace } from "../../lib/workspace.js";

// CSS modifier slug for categories that score/analyze rather than modify the
// sequence -- "by sub string index" / "by ACGT motif" / "Random" keep the default
// neutral styling (no slug).
const CATEGORY_SLUG = {
  Analysis: "analysis",
};

export function categorySlug(category) {
  return CATEGORY_SLUG[category] || "";
}

function identityMatrix() {
  return MUTATION_MATRIX_BASES.map((_, r) => MUTATION_MATRIX_BASES.map((_, c) => (r === c ? 1 : 0)));
}

export const BLOCK_DEFINITIONS = [
  {
    id: "replace_substring",
    section: "Sequence Modification",
    category: "by sub string index",
    label: "Replace sub string",
    summary: "Place a pattern at an index, optionally overwriting a run of bases.",
    fields: [
      { key: "pattern", label: "Pattern (ACGT)", type: "sequence", default: "aaaa" },
      { key: "index", label: "Index (1-based)", type: "int", default: 1 },
      { key: "length", label: "Overwrite length (0 = pure insert)", type: "int", default: 0 },
    ],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration(`Replace "${params.pattern}" @${params.index}`, (sessionId, signal) =>
        api.altByIndex.insert({ ...params, session_id: sessionId }, signal)
      ),
  },
  {
    id: "delete_substring",
    section: "Sequence Modification",
    category: "by sub string index",
    label: "Delete sub string",
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
      return workspace.runAlteration(`Delete from ${params.start} (${params.mode})`, (sessionId, signal) =>
        api.altByIndex.delete({ ...payload, session_id: sessionId }, signal)
      );
    },
  },
  {
    id: "move_substring",
    section: "Sequence Modification",
    category: "by sub string index",
    label: "Move sub string",
    summary: "Cut a region [start_cc, end_cc] and paste it at index_paste.",
    fields: [
      { key: "start_cc", label: "Cut start (1-based)", type: "int", default: 1 },
      { key: "end_cc", label: "Cut end (exclusive)", type: "int", default: 5 },
      { key: "index_paste", label: "Paste index (1-based)", type: "int", default: 20 },
      { key: "length_paste", label: "Paste overwrite length (0 = non-destructive)", type: "int", default: 0 },
    ],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration(`Move ${params.start_cc}-${params.end_cc} → @${params.index_paste}`, (sessionId, signal) =>
        api.altByIndex.move({ ...params, session_id: sessionId }, signal)
      ),
  },
  {
    id: "copy_paste_substring",
    section: "Sequence Modification",
    category: "by sub string index",
    label: "Copy & Paste sub string",
    summary: "Copy a region [start_cc, end_cc] and paste it at index_paste (source untouched).",
    fields: [
      { key: "start_cc", label: "Copy start (1-based)", type: "int", default: 1 },
      { key: "end_cc", label: "Copy end (exclusive)", type: "int", default: 5 },
      { key: "index_paste", label: "Paste index (1-based)", type: "int", default: 20 },
      { key: "length_paste", label: "Paste overwrite length (0 = non-destructive)", type: "int", default: 0 },
    ],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration(`Copy ${params.start_cc}-${params.end_cc} → @${params.index_paste}`, (sessionId, signal) =>
        api.altByIndex.copyPaste({ ...params, session_id: sessionId }, signal)
      ),
  },
  {
    id: "replace_motif",
    section: "Sequence Modification",
    category: "by ACGT motif",
    label: "Replace Motif",
    summary: 'Regex-like replace. "_" = 1 base, "%(n)" = up to n bases, "%" = any length.',
    fields: [
      { key: "old", label: "Pattern to find", type: "text", default: "acgt" },
      { key: "new", label: "Replacement", type: "text", default: "tgca" },
    ],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration(`Replace "${params.old}" → "${params.new}"`, (sessionId, signal) =>
        api.altByPattern.replace({ ...params, session_id: sessionId }, signal)
      ),
  },
  {
    id: "delete_motif",
    section: "Sequence Modification",
    category: "by ACGT motif",
    label: "Delete Motif",
    summary: "Delete every occurrence of a wildcard pattern.",
    fields: [{ key: "pattern", label: "Pattern", type: "text", default: "acgt" }],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration(`Delete pattern "${params.pattern}"`, (sessionId, signal) =>
        api.altByPattern.delete({ ...params, session_id: sessionId }, signal)
      ),
  },
  {
    id: "random_mutate",
    section: "Sequence Modification",
    category: "Random",
    label: "Random Mutation",
    summary: "Mutate every base independently using a 4×4 probability matrix (rows/cols = A,C,G,T).",
    fields: [{ key: "prob_mat", label: "Probability matrix", type: "matrix4x4", default: identityMatrix() }],
    outputKind: "sequence",
    run: (params) =>
      workspace.runAlteration("Random mutation (probability matrix)", (sessionId, signal) =>
        api.mutateIndependently({ prob_mat: params.prob_mat, session_id: sessionId }, signal)
      ),
  },
  {
    id: "windows_by_splicing_regulation",
    section: "Sequence Analysis",
    category: "Analysis",
    label: "Windows By Splicing Regulation",
    summary:
      'Slide masked ("N"-filled) windows across the sequence and measure the donor/acceptor score shift at the exon\'s boundaries.',
    fields: [
      { key: "exonGs", type: "groupStart", label: "Exon" },
      { key: "exonStart", label: "start", type: "int", default: 0 },
      { key: "exonEnd", label: "end", type: "int", default: 10 },
      { key: "exonGe", type: "groupEnd" },
      { key: "intervalGs", type: "groupStart", label: "Working interval" },
      {
        key: "intervalMode",
        label: "",
        type: "radioGroup",
        options: [
          { value: "full", label: "full sequence" },
          { value: "specify", label: "specify working zone" },
        ],
        default: "full",
      },
      { key: "intervalStart", label: "start:", type: "int", default: null, showIf: (p) => p.intervalMode === "specify" },
      { key: "intervalEnd", label: "end:", type: "int", default: null, showIf: (p) => p.intervalMode === "specify" },
      { key: "intervalGe", type: "groupEnd" },
      { key: "generalGs", type: "groupStart", label: "General algorithm settings" },
      { key: "windowSizes", label: "Window sizes", type: "intList", default: [5], itemDefault: 5 },
      { key: "batch_size", label: "Batch size", type: "int", default: 50 },
      { key: "models_used", label: "SpliceAI models used", type: "modelSet", default: [5] },
      {
        key: "searchActivator",
        label: "Search for activating subsequences (unchecked = inhibiting)",
        type: "checkbox",
        default: false,
      },
      { key: "topN", label: "number of output windows (x2)", type: "int", default: 5 },
      { key: "generalGe", type: "groupEnd" },
      { key: "presetGs", type: "groupStart", label: "Preset algorithm settings" },
      { key: "presetWindowSize", label: "window size:", type: "int", default: 50 },
      { key: "presetStep", label: "step:", type: "int", default: 10 },
      { key: "presetKeepProportion", label: "keep proportion (%):", type: "int", default: 10 },
      { key: "presetGe", type: "groupEnd" },
    ],
    outputKind: "rubberWindow",
    run: (params, onProgress) => {
      const hasInterval = params.intervalMode === "specify" && params.intervalStart != null && params.intervalEnd != null;
      return workspace.rubberWindow({
        exon: [params.exonStart, params.exonEnd],
        interval: hasInterval ? [params.intervalStart, params.intervalEnd] : null,
        window_size: null,
        all_window_size: params.windowSizes,
        batch_size: params.batch_size,
        models_used: params.models_used,
        search_activator_repressor: params.searchActivator ? "activator" : "repressor",
      }, onProgress);
    },
  },
  {
    id: "delta_score",
    section: "Sequence Analysis",
    category: "Analysis",
    label: "Delta Score",
    summary: "Calculate the delta-score between the input sequence and the modified one.",
    fields: [
      {
        key: "deltaMode",
        label: "",
        type: "radioGroup",
        options: [
          { value: "all", label: "All modifications applied" },
          { value: "independent", label: "Of each modification independently" },
        ],
        default: "all",
      },
      {
        key: "entityFilter",
        label: "",
        type: "radioGroup",
        options: [
          { value: "all", label: "show all entities" },
          { value: "topN", label: "show top N entities" },
        ],
        default: "all",
        showIf: (p) => p.deltaMode === "independent",
      },
      { key: "topN", label: "", type: "int", default: 5, showIf: (p) => p.deltaMode === "independent" && p.entityFilter === "topN" },
    ],
    outputKind: "probaHistory",
    run: (params) => {
      if (params.deltaMode === "all") {
        return workspace.fetchDeltaProba();
      }
      return workspace.fetchAllSimpleProbas();
    },
  },
  {
    id: "baseline_probability",
    section: "Sequence Analysis",
    category: "Analysis",
    label: "Baseline Probability",
    summary: "Absolute acceptor/donor splicing probability of the sequence as it stands right now in this session.",
    fields: [],
    outputKind: "proba",
    run: () => workspace.fetchCurrentSimpleProba(),
  },
];

export function blockById(id) {
  return BLOCK_DEFINITIONS.find((b) => b.id === id);
}

export function defaultParams(def) {
  const params = {};
  for (const field of def.fields) {
    if (!("default" in field)) continue;
    params[field.key] = typeof field.default === "function" ? field.default() : structuredClone(field.default);
  }
  return params;
}
