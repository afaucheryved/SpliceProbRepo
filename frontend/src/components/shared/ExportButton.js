import { html, useState, useRef, useEffect } from "../../lib/preact.js";

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function tableToCsv(columns, rows) {
  const header = columns.map((c) => csvEscape(c)).join(",");
  const body = rows.map((row) => columns.map((c) => csvEscape(row[c] ?? "")).join(",")).join("\n");
  return header + "\n" + body;
}

export function sequenceToText(sequence, reference) {
  if (reference) {
    const diff = [];
    for (let i = 0; i < Math.max(sequence.length, reference.length); i++) {
      const s = sequence[i] || "";
      const r = reference[i] || "";
      if (s === r) diff.push(`  ${s}`);
      else diff.push(`> ${s || "-"}`);
    }
    return `Reference: ${reference}\nAltered:   ${sequence}\n\nDiff (positional):\n${diff.join("\n")}`;
  }
  return sequence;
}

export function ExportButton({ onExport, hidePng }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const formats = hidePng
    ? [
        { key: "csv", label: "CSV" },
        { key: "txt", label: "txt" },
      ]
    : [
        { key: "csv", label: "CSV" },
        { key: "txt", label: "txt" },
        { key: "png", label: "png" },
      ];

  const select = (key) => {
    setOpen(false);
    onExport(key);
  };

  return html`
    <div class="export-btn" ref=${ref}>
      <button type="button" class="export-btn__trigger" title="Export / download" onClick=${() => setOpen((v) => !v)}>
        <span class="export-btn__icon">⤓</span>
        <span class="export-btn__arrow">▾</span>
      </button>
      ${open
        ? html`
            <div class="export-btn__menu">
              ${formats.map((f) => html`<button key=${f.key} type="button" class="export-btn__item" onClick=${() => select(f.key)}>${f.label}</button>`)}
            </div>
          `
        : null}
    </div>
  `;
}