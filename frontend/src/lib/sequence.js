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
  m = body.match(/^move:(\d+)-(\d+)->@(\d+)$/);
  if (m) {
    return { from: Number(m[1]) - 1, to: Number(m[2]) - 1, summary: body };
  }

  // copy_paste:{start_cc}-{end_cc}@{index_paste}
  m = body.match(/^copy_paste:(\d+)-(\d+)@(\d+)$/);
  if (m) {
    return { from: Number(m[1]) - 1, to: Number(m[2]) - 1, summary: body };
  }

  // replace:{old}->{new}
  m = body.match(/^replace:(.+)->(.+)$/);
  if (m) {
    return { from: 0, to: 0, summary: body };
  }

  // delete_by_pattern:{pattern}
  m = body.match(/^delete_by_pattern:(.+)$/);
  if (m) {
    return { from: 0, to: 0, summary: body };
  }

  // mutate_independently
  if (body === "mutate_independently") {
    return { from: 0, to: 0, summary: "Random mutation" };
  }

  return null;
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
