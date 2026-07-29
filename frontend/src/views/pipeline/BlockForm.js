import { html, useState } from "../../lib/preact.js";
import { MUTATION_MATRIX_BASES } from "../../api/client.js";

const BASE_OPTIONS = ["a", "c", "g", "t"];

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

function MutationListField({ field, value, onChange, blockUid, onDropOnMutationList, onDropLibraryBlock }) {
  const rows = value ?? [];
  const [dropError, setDropError] = useState(null);
  const [dropOver, setDropOver] = useState(false);
  const update = (i, patch) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const add = () => onChange([...rows, { position: rows.length + 1, ref: "a", alt: "c" }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));

  function handleDragOver(e) {
    // Accept drops from already-placed recipe blocks (translate their
    // before/after diff) and from the library palette (add + prompt to Bake
    // first, since a library block has no diff to translate yet).
    if (
      !e.dataTransfer.types.includes("application/x-recipe-block-uid") &&
      !e.dataTransfer.types.includes("application/x-block-id")
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setDropOver(true);
  }

  function handleDragLeave(e) {
    setDropOver(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDropOver(false);
    setDropError(null);

    const libraryBlockId = e.dataTransfer.getData("application/x-block-id");
    if (libraryBlockId && onDropLibraryBlock) {
      const result = onDropLibraryBlock(blockUid, libraryBlockId);
      if (result && result.error) setDropError(result.error);
      return;
    }

    const sourceUid = e.dataTransfer.getData("application/x-recipe-block-uid");
    if (!sourceUid || !onDropOnMutationList) return;
    const result = onDropOnMutationList(blockUid, sourceUid);
    if (result && result.error) {
      setDropError(result.error);
    }
  }

  return html`
    <div
      class="field mutation-list ${dropOver ? "mutation-list--drop-target" : ""}"
      onDragOver=${handleDragOver}
      onDragLeave=${handleDragLeave}
      onDrop=${handleDrop}
    >
      <label>
        ${field.label}
        <span class="field-hint"> — drag an Index-based or Pattern-based block here (from the recipe or the library) to append its mutations</span>
      </label>
      ${dropError ? html`<p class="recipe-block__error">⚠ ${dropError}</p>` : null}
      ${rows.map(
        (row, i) => html`
          <div class="mutation-list__row" key=${i}>
            <span class="mutation-list__prefix">>p.</span>
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
            <span>></span>
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

const FIELD_COMPONENTS = {
  text: TextField,
  sequence: TextField,
  int: IntField,
  select: SelectField,
  checkbox: CheckboxField,
  mutationList: MutationListField,
  matrix4x4: Matrix4x4Field,
  modelSet: ModelSetField,
  intList: IntListField,
};

// Generic form renderer driven entirely by a block definition's `fields`
// schema (see blockDefinitions.js) -- adding a new block never requires
// touching this file.
export function BlockForm({ def, params, onChange, blockUid, onDropOnMutationList, onDropLibraryBlock }) {
  const setField = (key, value) => onChange({ ...params, [key]: value });
  return html`
    <div class="block-form">
      ${def.fields
        .filter((field) => !field.showIf || field.showIf(params))
        .map((field) => {
          const Field = FIELD_COMPONENTS[field.type] ?? TextField;
          return html`<${Field} key=${field.key} field=${field} value=${params[field.key]} onChange=${(v) => setField(field.key, v)} blockUid=${blockUid} onDropOnMutationList=${onDropOnMutationList} onDropLibraryBlock=${onDropLibraryBlock} />`;
        })}
    </div>
  `;
}
