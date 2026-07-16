// DNA sequence helpers shared by all three frontend proposals.
// Mirrors validation rules from app/domain/calcul_function.py (IsValid) and
// the mutation syntax from app/services/general_services.py.

const SEQUENCE_RE = /^[ACGTacgt]+$/;
const MUTATION_RE = /^>p\.\d+\.[atgcATGC]>[atgcATGC]$/;

export function isValidSequence(sequence) {
  return typeof sequence === "string" && sequence.length > 0 && SEQUENCE_RE.test(sequence);
}

export function isValidMutation(mutation) {
  return mutation === "" || MUTATION_RE.test(mutation);
}

export function cleanSequence(sequence) {
  return (sequence ?? "").trim().replace(/[\n\r\s]/g, "");
}

// Build a mutation string ">p.<pos>.<ref>><alt>" from parts (1-based position).
export function buildMutation(position, ref, alt) {
  return `>p.${position}.${ref.toLowerCase()}>${alt.toLowerCase()}`;
}

// Parse a single-record FASTA file's text content (Task 19).
//
// Conventions handled:
//   - Header line starts with '>' — everything after it is the display name.
//   - Legacy ';' comment lines (older Pearson/Lipman FASTA dialect) are
//     ignored, as are blank lines anywhere in the file.
//   - All other non-empty lines are sequence lines: leading/trailing
//     whitespace is stripped per line, then lines are concatenated —
//     FASTA line-wrapping is formatting only, never meaningful.
//   - A file with more than one '>' header is rejected outright (multi-record
//     files are out of scope — never silently used-first-record-only or
//     concatenated-across-records).
//   - Case/whitespace normalization of the final sequence reuses the
//     existing `cleanSequence()`/`isValidSequence()` rather than
//     reimplementing DNA validation here; callers should still run
//     `isValidSequence()` on the result before using it (e.g. an all-`N`
//     FASTA file parses fine here but is rejected by the existing strict
//     ACGT-only validation — that's expected, not a bug in this parser).
//
// Returns `{ name, sequence, error }` — `error` is null on success.
export function parseFasta(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { name: null, sequence: null, error: "The file is empty." };
  }

  const lines = text.split(/\r\n|\r|\n/);
  let name = null;
  let headerCount = 0;
  const bodyLines = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue; // blank lines are formatting only
    if (line.startsWith(";")) continue; // legacy FASTA comment line
    if (line.startsWith(">")) {
      headerCount++;
      if (headerCount === 1) name = line.slice(1).trim();
      continue;
    }
    bodyLines.push(line);
  }

  if (headerCount === 0) {
    return { name: null, sequence: null, error: "Not a FASTA file — missing a header line starting with '>'." };
  }
  if (headerCount > 1) {
    return {
      name: null,
      sequence: null,
      error: `This file contains ${headerCount} records (multiple '>' headers) — only single-record FASTA files are supported.`,
    };
  }

  const sequence = cleanSequence(bodyLines.join(""));
  if (!sequence) {
    return { name, sequence: null, error: "No sequence data found after the header line." };
  }

  return { name: name || "uploaded sequence", sequence, error: null };
}

// Parse ">p.8.a>c" -> { position: 8, ref: "a", alt: "c" }; null if malformed/empty.
export function parseMutation(mutation) {
  const m = /^>p\.(\d+)\.([atgcATGC])>([atgcATGC])$/.exec(mutation);
  if (!m) return null;
  return { position: Number(m[1]), ref: m[2].toLowerCase(), alt: m[3].toLowerCase() };
}

// Character-level diff between two same-scale sequences for highlighting.
// Returns an array of { index, ref, alt, changed }.
export function diffSequences(reference, altered) {
  const len = Math.max(reference.length, altered.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    const ref = reference[i] ?? "";
    const alt = altered[i] ?? "";
    out.push({ index: i, ref, alt, changed: ref.toLowerCase() !== alt.toLowerCase() });
  }
  return out;
}

const BASE_COLORS = {
  a: "var(--base-a)",
  c: "var(--base-c)",
  g: "var(--base-g)",
  t: "var(--base-t)",
};

export function baseColor(base) {
  return BASE_COLORS[(base || "").toLowerCase()] ?? "var(--base-n)";
}

// Backend "proba" dict looks like: { 0: {"a": 0.01}, 1: {"c": 0.02}, ... }
// (object keys are stringified integers because it crossed JSON). Flatten to
// parallel arrays for charting.
export function flattenProbaTrack(probaByIndex) {
  const indices = Object.keys(probaByIndex ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  const bases = [];
  const values = [];
  for (const i of indices) {
    const entry = probaByIndex[i];
    const [base, value] = Object.entries(entry)[0];
    bases.push(base);
    values.push(value);
  }
  return { positions: indices, bases, values };
}

// GetDeltaScore's per-key dict looks like:
// { 0: { value: -0.001, delta_proportion_variation: -0.5 }, ... }
export function flattenDeltaTrack(deltaByIndex) {
  const indices = Object.keys(deltaByIndex ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  const values = indices.map((i) => deltaByIndex[i].value);
  const proportions = indices.map((i) => deltaByIndex[i].delta_proportion_variation);
  return { positions: indices, values, proportions };
}

// Largest |delta| across a tracked alteration entry's acceptor/donor
// positions, used to rank entries for top-N filtering.
export function maxTrackedDelta(entry) {
  const acceptor = entry?.delta_proba?.acceptor_proba;
  const donor = entry?.delta_proba?.donor_proba;
  let maxDelta = 0;
  if (acceptor) {
    for (const v of Object.values(acceptor)) {
      maxDelta = Math.max(maxDelta, Math.abs(v?.value ?? 0));
    }
  }
  if (donor) {
    for (const v of Object.values(donor)) {
      maxDelta = Math.max(maxDelta, Math.abs(v?.value ?? 0));
    }
  }
  return maxDelta;
}

// Ranks a label -> entry map (as returned by GET /get/allsimpleprobas) by
// `maxTrackedDelta()` and keeps the top `topN`.
export function topTrackedEntries(entriesByLabel, topN) {
  const n = Math.max(1, topN || 5);
  return Object.entries(entriesByLabel ?? {})
    .map(([label, entry]) => ({ label, entry, maxDelta: maxTrackedDelta(entry) }))
    .sort((a, b) => b.maxDelta - a.maxDelta)
    .slice(0, n);
}

// Task 20: per-bar green (increase) / red (decrease) fill for a delta-vs-base
// bar chart, one color per position in `values`. `colors` is a
// `{ deltaPositive, deltaNegative }` pair (see lib/theme.js `seriesColors()`)
// so the fill is theme-aware -- Chart.js needs literal color strings, not
// unresolved CSS var() references, for canvas fills (item 3).
export function deltaBarColors(values, colors) {
  const positive = colors?.deltaPositive ?? "#22c55e";
  const negative = colors?.deltaNegative ?? "#ef4444";
  return values.map((v) => (v >= 0 ? positive : negative));
}

// Task 20 (generic operation zone, pale green) / Task 18 (specific
// pattern-match sub-region, pale red): per-bar colored border to mark a
// `{from, to}` range (0-based inclusive, same coordinate space as
// `positions`) directly on a delta bar chart, without a separate annotation
// plugin. Bars outside the range (or when `range` is null -- position not
// determinable) get no border.
export function zoneBorderStyle(positions, range) {
  if (!range) {
    return { borderColor: positions.map(() => "transparent"), borderWidth: positions.map(() => 0) };
  }
  const borderColor = positions.map((p) => (p >= range.from && p <= range.to ? "#ffffff" : "transparent"));
  const borderWidth = positions.map((p) => (p >= range.from && p <= range.to ? 2 : 0));
  return { borderColor, borderWidth };
}

// Task 17 stores a pattern match's exact position directly on the entry
// (`match_start`/`match_end`, 0-based inclusive) so this doesn't need to be
// re-parsed from the label. Falls back to the generic operation-zone range
// from `parseTrackedLabel()` for entries that aren't a specific pattern
// match. Returns `{ range, isPatternMatch }` -- `isPatternMatch` selects the
// pale-red (Task 18) vs. pale-green (Task 20) color at the call site.
export function trackedEntryZone(label, entry) {
  if (entry?.match_start != null && entry?.match_end != null) {
    return { range: { from: entry.match_start, to: entry.match_end }, isPatternMatch: true };
  }
  return { range: parseTrackedLabel(label), isPatternMatch: false };
}

// Parse a tracked-alteration human label (e.g. "insert:aaaa@12", "delete:2",
// "move:3-6->@10", "copy_paste:1-5@10", "replace:acgt->tgca",
// "delete_by_pattern:acgt") into a position range [from, to] (0-based) and a
// human-readable summary.
//
// Returns null if the label cannot be parsed.
export function parseTrackedLabel(label) {
  // Strip step prefix like "3: " or "5: " (Compare uses this format).
  const body = label.replace(/^\d+:\s*/, "");

  // insert:{pattern}@{index}
  let m = body.match(/^insert:(.+)@(\d+)$/);
  if (m) {
    const idx = Number(m[2]) - 1; // convert to 0-based
    const len = m[1].length;
    return { from: idx, to: idx + len - 1, summary: body };
  }

  // delete:{start}
  m = body.match(/^delete:(\d+)$/);
  if (m) {
    const start = Number(m[1]) - 1;
    return { from: start, to: start, summary: body };
  }

  // move:{start_cc}-{end_cc}->@{index_paste}
  // After a move the content lives at the paste destination, not the source.
  m = body.match(/^move:(\d+)-(\d+)->@(\d+)$/);
  if (m) {
    const destStart = Number(m[3]) - 1; // 0-based paste index
    const patternLen = Number(m[2]) - Number(m[1]) + 1;
    return { from: destStart, to: destStart + patternLen - 1, summary: body };
  }

  // copy_paste:{start_cc}-{end_cc}@{index_paste}
  // The new copy lives at the paste destination, not the source.
  m = body.match(/^copy_paste:(\d+)-(\d+)@(\d+)$/);
  if (m) {
    const destStart = Number(m[3]) - 1;
    const patternLen = Number(m[2]) - Number(m[1]) + 1;
    return { from: destStart, to: destStart + patternLen - 1, summary: body };
  }

  // replace:{old}->{new} — position not encoded in label; skip rather than
  // misattributing to position 0.  Task 17 will supply real per-match ranges.
  m = body.match(/^replace:(.+)->(.+)$/);
  if (m) {
    return null;
  }

  // delete_by_pattern:{pattern} — same reasoning as replace above.
  m = body.match(/^delete_by_pattern:(.+)$/);
  if (m) {
    return null;
  }

  // mutate_independently — position not encoded; skip.
  if (body === "mutate_independently") {
    return null;
  }

  return null;
}

// Parse a tracked-alteration label into display components for the new
// "**{N}** : **{operation_type}** : [{from} - {to}]" syntax.
// Returns { stepNum, opType, rangeText } or null if unparseable.
export function parseTrackedAlterationDisplay(label, entry) {
  let stepNum = "";
  let body = label;
  const stepMatch = label.match(/^(\d+):\s*/);
  if (stepMatch) {
    stepNum = stepMatch[1];
    body = label.slice(stepMatch[0].length);
  }

  let opType = "mutation";
  if (body.startsWith("insert:")) opType = "insert";
  else if (body.startsWith("delete_by_pattern:") || body.startsWith("delete:")) opType = "delete";
  else if (body.startsWith("move:")) opType = "move";
  else if (body.startsWith("copy_paste:")) opType = "copy & paste";
  else if (body.startsWith("replace:")) opType = "replace";
  else if (body === "mutate_independently") opType = "random mutation";

  let rangeText;
  if (entry?.match_start != null && entry?.match_end != null) {
    rangeText = `[${entry.match_start + 1} - ${entry.match_end + 1}]`;
  } else if (entry?.delta_proba) {
    rangeText = "(all mutations applied)";
  } else {
    const parsed = parseTrackedLabel(label);
    if (parsed) {
      rangeText = `[${parsed.from + 1} - ${parsed.to + 1}]`;
    } else {
      rangeText = "(all mutations applied)";
    }
  }

  return { stepNum, opType, rangeText };
}
// Returns { mutations: string[], error: null } on success,
// or { mutations: null, error: "message" } on failure.
export function diffToPointMutations(before, after) {
  if (!before || !after) {
    return { mutations: null, error: "No sequence data available for this block. Run the recipe first." };
  }
  if (before.length !== after.length) {
    return {
      mutations: null,
      error: `Cannot translate to point mutations: the operation changes sequence length (${before.length} → ${after.length} bp). Only same-length edits are representable as point mutations.`,
    };
  }
  const mutations = [];
  for (let i = 0; i < before.length; i++) {
    const ref = before[i].toLowerCase();
    const alt = after[i].toLowerCase();
    if (ref !== alt) {
      mutations.push(buildMutation(i + 1, ref, alt));
    }
  }
  return { mutations, error: null };
}

export function downloadFile(filename, content, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => c.label).join(",");
  const body = rows
    .map((row) => columns.map((c) => JSON.stringify(c.value(row) ?? "")).join(","))
    .join("\n");
  return header + "\n" + body;
}
