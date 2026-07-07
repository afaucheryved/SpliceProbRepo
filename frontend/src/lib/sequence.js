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
