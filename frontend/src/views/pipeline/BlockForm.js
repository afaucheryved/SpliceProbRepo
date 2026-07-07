import { html } from "../../lib/preact.js";
import { MUTATION_MATRIX_BASES } from "../../api/client.js";

const BASE_OPTIONS = ["a", "c", "g", "t"];

function TextField({ field, value, onChange }) {
  return html`
    <div class="field">
      <label>${field.label}</label>
      <input
        type="text"
        class=${field.type === "sequence" ? "mono" : ""}
        value=${value ?? ""}
        onInput=${(e) => onChange(e.currentTarget.value)}
      />
    </div>
  `;
}

function IntField({ field, value, onChange }) {
  return html`
    <div class="field">
      <label>${field.label}</label>
      <input
        type="number"
        step="1"
        value=${value ?? 0}
        onInput=${(e) => onChange(parseInt(e.currentTarget.value || "0", 10))}
      />
    </div>
  `;
}

function SelectField({ field, value, onChange }) {
  return html`
    <div class="field">
      <label>${field.label}</label>
      <select value=${value} onChange=${(e) => onChange(e.currentTarget.value)}>
        ${field.options.map((opt) => html`<option value=${opt.value}>${opt.label}</option>`)}
      </select>
    </div>
  `;
}

function MutationListField({ field, value, onChange }) {
  const rows = value ?? [];
  const update = (i, patch) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const add = () => onChange([...rows, { position: rows.length + 1, ref: "a", alt: "c" }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return html`
    <div class="field mutation-list">
      <label>${field.label}</label>
      ${rows.map(
        (row, i) => html`
          <div class="mutation-list__row" key=${i}>
            <span class="mutation-list__prefix">&gt;p.</span>
            <input
              type="number"
              min="1"
              class="mutation-list__pos"
              value=${row.position}
              onInput=${(e) => update(i, { position: parseInt(e.currentTarget.value || "1", 10) })}
            />
            <select value=${row.ref} onChange=${(e) => update(i, { ref: e.currentTarget.value })}>
              ${BASE_OPTIONS.map((b) => html`<option value=${b}>${b}</option>`)}
            </select>
            <span>&gt;</span>
            <select value=${row.alt} onChange=${(e) => update(i, { alt: e.currentTarget.value })}>
              ${BASE_OPTIONS.map((b) => html`<option value=${b}>${b}</option>`)}
            </select>
            <button type="button" class="btn btn--small btn--danger" onClick=${() => remove(i)}>✕</button>
          </div>
        `
      )}
      <button type="button" class="btn btn--small" onClick=${add}>+ Add mutation</button>
      ${rows.length === 0 ? html`<p class="field-hint">No mutations added — will score the unmutated baseline.</p>` : null}
    </div>
  `;
}

function Matrix4x4Field({ field, value, onChange }) {
  const matrix = value ?? [];
  const update = (r, c, v) => {
    const next = matrix.map((row) => [...row]);
    next[r][c] = v;
    onChange(next);
  };
  return html`
    <div class="field">
      <label>${field.label} <span class="field-hint">(row = original base, column = mutated base)</span></label>
      <table class="matrix-field">
        <thead>
          <tr>
            <th></th>
            ${MUTATION_MATRIX_BASES.map((b) => html`<th>${b}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${MUTATION_MATRIX_BASES.map(
            (rowBase, r) => html`
              <tr key=${rowBase}>
                <th>${rowBase}</th>
                ${MUTATION_MATRIX_BASES.map(
                  (_, c) => html`
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value=${matrix[r]?.[c] ?? 0}
                        onInput=${(e) => update(r, c, parseFloat(e.currentTarget.value || "0"))}
                      />
                    </td>
                  `
                )}
              </tr>
            `
          )}
        </tbody>
      </table>
    </div>
  `;
}

function ModelSetField({ field, value, onChange }) {
  const selected = value ?? [];
  const toggle = (n) => {
    onChange(selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n].sort());
  };
  return html`
    <div class="field">
      <label>${field.label}</label>
      <div class="field-row">
        ${[1, 2, 3, 4, 5].map(
          (n) => html`
            <label class="checkbox-pill" key=${n}>
              <input type="checkbox" checked=${selected.includes(n)} onChange=${() => toggle(n)} />
              ${n}
            </label>
          `
        )}
      </div>
    </div>
  `;
}

const FIELD_COMPONENTS = {
  text: TextField,
  sequence: TextField,
  int: IntField,
  select: SelectField,
  mutationList: MutationListField,
  matrix4x4: Matrix4x4Field,
  modelSet: ModelSetField,
};

// Generic form renderer driven entirely by a block definition's `fields`
// schema (see blockDefinitions.js) -- adding a new block never requires
// touching this file.
export function BlockForm({ def, params, onChange }) {
  const setField = (key, value) => onChange({ ...params, [key]: value });
  return html`
    <div class="block-form">
      ${def.fields
        .filter((field) => !field.showIf || field.showIf(params))
        .map((field) => {
          const Field = FIELD_COMPONENTS[field.type] ?? TextField;
          return html`<${Field} key=${field.key} field=${field} value=${params[field.key]} onChange=${(v) => setField(field.key, v)} />`;
        })}
    </div>
  `;
}
