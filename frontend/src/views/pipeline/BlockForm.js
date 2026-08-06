import { html } from "../../lib/preact.js";
import { MUTATION_MATRIX_BASES } from "../../api/client.js";

function TextField({ field, value, onChange }) {
  return html`
    <div class="field">
      <label>${field.label}</label>
      <input
        type="text"
        class="field__control ${field.type === "sequence" ? "mono" : ""}"
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
        class="field__control"
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
      <select class="field__control" value=${value} onChange=${(e) => onChange(e.currentTarget.value)}>
        ${field.options.map((opt) => html`<option value=${opt.value}>${opt.label}</option>`)}
      </select>
    </div>
  `;
}

function CheckboxField({ field, value, onChange }) {
  return html`
    <div class="field">
      <label class="checkbox-pill">
        <input type="checkbox" checked=${!!value} onChange=${(e) => onChange(e.currentTarget.checked)} />
        ${field.label}
      </label>
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
          ${MUTATION_MATRIX_BASES.map((rowBase, r) => {
            const rowSum = (matrix[r] ?? []).reduce((s, v) => s + (Number(v) || 0), 0);
            const rowInvalid = Math.abs(rowSum - 1) > 0.001;
            return html`
              <tr key=${rowBase} class=${rowInvalid ? "matrix-field__row--invalid" : ""}>
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
            `;
          })}
        </tbody>
      </table>
      <p class="field-hint">Rows highlighted in red do not sum to 1.</p>
    </div>
  `;
}

function IntListField({ field, value, onChange }) {
  const items = value ?? [];
  const update = (i, v) => onChange(items.map((x, idx) => (idx === i ? v : x)));
  const add = () => onChange([...items, field.itemDefault ?? 1]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return html`
    <div class="field">
      <label>${field.label}</label>
      ${items.map(
        (v, i) => html`
          <div class="field-row" key=${i}>
            <input
              type="number"
              step="1"
              class="field__control"
              value=${v}
              onInput=${(e) => update(i, parseInt(e.currentTarget.value || "0", 10))}
            />
            <button type="button" class="btn btn--small btn--danger" onClick=${() => remove(i)}>✕</button>
          </div>
        `
      )}
      <button type="button" class="btn btn--small" onClick=${add}>+ Add window size</button>
      ${items.length === 0 ? html`<p class="field-hint">No window sizes added — nothing will be tiled.</p>` : null}
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

function RadioGroupField({ field, value, onChange }) {
  return html`
    <div class="field">
      <label>${field.label}</label>
      <div class="field-row radio-group">
        ${field.options.map((opt) => html`
          <label key=${opt.value} class="radio-pill">
            <input
              type="radio"
              name=${field.key}
              value=${opt.value}
              checked=${value === opt.value}
              onChange=${() => onChange(opt.value)}
            />
            ${opt.label}
          </label>
        `)}
      </div>
    </div>
  `;
}

const FIELD_COMPONENTS = {
  text: TextField,
  sequence: TextField,
  int: IntField,
  select: SelectField,
  checkbox: CheckboxField,
  matrix4x4: Matrix4x4Field,
  modelSet: ModelSetField,
  intList: IntListField,
  radioGroup: RadioGroupField,
};

export function BlockForm({ def, params, onChange }) {
  const setField = (key, value) => onChange({ ...params, [key]: value });
  const visible = def.fields.filter((field) => !field.showIf || field.showIf(params));

  const elements = [];
  for (let i = 0; i < visible.length; i++) {
    const field = visible[i];
    if (field.type === "groupStart") {
      const label = field.label;
      const groupFields = [];
      i++;
      while (i < visible.length && visible[i].type !== "groupEnd") {
        groupFields.push(visible[i]);
        i++;
      }
      elements.push(html`
        <fieldset class="block-form__group" key=${field.key}>
          <legend class="block-form__group-legend">${label}</legend>
          ${groupFields.map((gf) => {
            const Comp = FIELD_COMPONENTS[gf.type] ?? TextField;
            return html`<${Comp} key=${gf.key} field=${gf} value=${params[gf.key]} onChange=${(v) => setField(gf.key, v)} />`;
          })}
        </fieldset>
      `);
    } else {
      const Comp = FIELD_COMPONENTS[field.type] ?? TextField;
      elements.push(html`<${Comp} key=${field.key} field=${field} value=${params[field.key]} onChange=${(v) => setField(field.key, v)} />`);
    }
  }

  return html`<div class="block-form">${elements}</div>`;
}
