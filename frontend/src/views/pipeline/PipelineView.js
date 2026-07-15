import { html, useState, useRef } from "../../lib/preact.js";
import { SessionBar } from "../../components/shared/SessionBar.js";
import { Spinner } from "../../components/shared/Feedback.js";
import { useWorkspace, workspace } from "../../lib/workspace.js";
import { api } from "../../api/client.js";
import { parseTrackedLabel, parseMutation, diffToPointMutations } from "../../lib/sequence.js";
import { BlockLibrary } from "./BlockLibrary.js";
import { RecipeBlock } from "./RecipeBlock.js";
import { OutputPanel } from "./OutputPanel.js";
import { BLOCK_DEFINITIONS, blockById, defaultParams } from "./blockDefinitions.js";

let uidSeq = 0;
const nextUid = () => `blk_${++uidSeq}`;

// Item 6: draggable column boundaries. Floors mirror the layout's previous
// fixed sizes (240px library / 360px recipe / 320px output) so resizing can
// never squeeze a column away entirely.
const HANDLE_WIDTH = 8;
const MIN_LIBRARY_WIDTH = 180;
const MIN_RECIPE_WIDTH = 360;
const MIN_OUTPUT_WIDTH = 320;

function summarize(def, result) {
  switch (def.outputKind) {
    case "sequence":
      return `→ ${result.length.toLocaleString()} bp`;
    case "proba":
      return "→ baseline probability computed";
    case "probaHistory":
      return `→ ${Object.keys(result ?? {}).length} tracked alteration(s)`;
    case "delta":
      return "→ delta score computed";
    case "zones":
      return `→ ${Object.keys(result ?? {}).length} pattern(s) scored`;
    default:
      return "→ done";
  }
}

export function PipelineView() {
  const ws = useWorkspace();
  const [recipe, setRecipe] = useState([]);
  const [running, setRunning] = useState(false);
  const [finalResult, setFinalResult] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [libraryWidth, setLibraryWidth] = useState(240);
  const [recipeWidth, setRecipeWidth] = useState(420);
  const [outputWidth, setOutputWidth] = useState(360);
  const columnsRef = useRef(null);
  const resizeStateRef = useRef(null);
  const cancelRef = useRef(false);

  function handleResizeMove(e) {
    const rs = resizeStateRef.current;
    if (!rs) return;
    const delta = e.clientX - rs.startX;
    const gaps = HANDLE_WIDTH * 2;
    if (rs.column === "library") {
      const maxLibrary = Math.max(MIN_LIBRARY_WIDTH, rs.containerWidth - gaps - rs.startRecipe - MIN_OUTPUT_WIDTH);
      setLibraryWidth(Math.min(Math.max(MIN_LIBRARY_WIDTH, rs.startLibrary + delta), maxLibrary));
    } else if (rs.column === "recipe") {
      const maxRecipe = Math.max(MIN_RECIPE_WIDTH, rs.containerWidth - gaps - rs.startLibrary - MIN_OUTPUT_WIDTH);
      setRecipeWidth(Math.min(Math.max(MIN_RECIPE_WIDTH, rs.startRecipe + delta), maxRecipe));
    } else if (rs.column === "output") {
      const maxOutput = Math.max(MIN_OUTPUT_WIDTH, rs.containerWidth - gaps - rs.startLibrary - rs.startRecipe);
      setOutputWidth(Math.min(Math.max(MIN_OUTPUT_WIDTH, rs.startOutput + delta), maxOutput));
    }
  }

  function stopResize() {
    resizeStateRef.current = null;
    window.removeEventListener("mousemove", handleResizeMove);
    window.removeEventListener("mouseup", stopResize);
  }

  function startResize(column, e) {
    e.preventDefault();
    resizeStateRef.current = {
      column,
      startX: e.clientX,
      startLibrary: libraryWidth,
      startRecipe: recipeWidth,
      startOutput: outputWidth,
      containerWidth: columnsRef.current?.getBoundingClientRect().width ?? 0,
    };
    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", stopResize);
  }

  function addBlock(defId, atIndex = recipe.length) {
    const def = blockById(defId);
    const block = {
      uid: nextUid(),
      defId,
      params: defaultParams(def),
      enabled: true,
      status: "idle",
      error: null,
      resultSummary: null,
    };
    setRecipe((r) => {
      const next = [...r];
      next.splice(atIndex, 0, block);
      return next;
    });
  }

  const removeBlock = (uid) => setRecipe((r) => r.filter((b) => b.uid !== uid));
  const toggleBlock = (uid) => setRecipe((r) => r.map((b) => (b.uid === uid ? { ...b, enabled: !b.enabled } : b)));
  const updateParams = (uid, params) => setRecipe((r) => r.map((b) => (b.uid === uid ? { ...b, params } : b)));

  function patchBlock(uid, patch) {
    setRecipe((r) => r.map((b) => (b.uid === uid ? { ...b, ...patch } : b)));
  }

  function reorder(from, to) {
    setRecipe((r) => {
      const next = [...r];
      const [moved] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, moved);
      return next;
    });
  }

  const dragHandlers = {
    onDragStart: (e, index) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
      // Also tag the drag with the recipe block's uid so mutation-list
      // drop targets can identify which block was dragged (Task 9).
      const block = recipe[index];
      if (block) e.dataTransfer.setData("application/x-recipe-block-uid", block.uid);
    },
    onDragOver: (e, index) => {
      e.preventDefault();
      setOverIndex(index);
    },
    onDragLeave: () => setOverIndex(null),
    onDrop: (e, index) => {
      e.preventDefault();
      const libraryBlockId = e.dataTransfer.getData("application/x-block-id");
      if (libraryBlockId) {
        addBlock(libraryBlockId, index);
      } else if (dragIndex !== null && dragIndex !== index) {
        reorder(dragIndex, index);
      }
      setDragIndex(null);
      setOverIndex(null);
    },
  };

  function handleTailDrop(e) {
    e.preventDefault();
    const libraryBlockId = e.dataTransfer.getData("application/x-block-id");
    if (libraryBlockId) addBlock(libraryBlockId, recipe.length);
    else if (dragIndex !== null) reorder(dragIndex, recipe.length);
    setDragIndex(null);
    setOverIndex(null);
  }

  // Fallback handlers on the .recipe-stack container itself, so empty space
  // around/below the blocks (not just block rows or the tail strip) also
  // accepts a drop. Guarded to only act when the event target is the
  // container itself — drops on a child (RecipeBlock, tail strip) are
  // already handled there and bubble up here without re-triggering.
  function handleStackDragOver(e) {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    setOverIndex(recipe.length);
  }
  function handleStackDrop(e) {
    if (e.target !== e.currentTarget) return;
    handleTailDrop(e);
  }
  function handleStackDragLeave(e) {
    if (e.target !== e.currentTarget) return;
    setOverIndex(null);
  }

  const ALTERATION_CATEGORIES = new Set(["Index-based", "Pattern-based", "Random"]);

  async function bake() {
    if (!ws.sessionId) return;
    setRunning(true);
    setFinalResult(null);
    cancelRef.current = false;
    setRecipe((r) => r.map((b) => ({ ...b, status: "idle", error: null, resultSummary: null })));

    // If any enabled block is an alteration-category block, reset the session
    // so every Bake starts from a clean altered sequence (no accumulated
    // tracked entries from previous Bakes) — see Task 7.
    const hasAlteration = recipe.some(
      (b) => b.enabled && ALTERATION_CATEGORIES.has(blockById(b.defId).category)
    );
    if (hasAlteration) {
      try {
        await workspace.resetSession();
      } catch {
        // If reset fails, continue anyway — the bake will run on whatever
        // state the session is in, and the error is surfaced via ws.lastError.
      }
    }

    let lastOutput = null;
    let stopped = false;
    let runningSequence = ws.baseSequence;
    const allResults = [];
    for (const block of recipe) {
      if (cancelRef.current || stopped) {
        patchBlock(block.uid, { status: "skipped" });
        continue;
      }
      if (!block.enabled) {
        patchBlock(block.uid, { status: "skipped" });
        continue;
      }
      const def = blockById(block.defId);
      const beforeSeq = runningSequence;
      patchBlock(block.uid, { status: "running" });
      try {
        const result = await def.run(block.params);
        // If this block produced a sequence result, update the running
        // sequence and store the before/after pair on the block.
        if (def.outputKind === "sequence" && typeof result === "string") {
          runningSequence = result;
          patchBlock(block.uid, {
            status: "success",
            resultSummary: summarize(def, result),
            resultData: result,
            beforeSequence: beforeSeq,
          });
        } else {
          patchBlock(block.uid, {
            status: "success",
            resultSummary: summarize(def, result),
            resultData: result,
          });
        }
        lastOutput = { kind: def.outputKind, data: result, params: block.params };
        allResults.push(lastOutput);
      } catch (err) {
        patchBlock(block.uid, { status: "error", error: err.message || String(err) });
        stopped = true;
      }
    }

    // If the bake produced a sequence output, fetch the tracked-alteration
    // history to build the operations map for hover labels (Task 8).
    let operations = null;
    if (hasAlteration && lastOutput?.kind === "sequence") {
      try {
        const probaData = await api.get.allSimpleProbas(ws.sessionId);
        if (probaData) {
          operations = new Map();
          for (const [label] of Object.entries(probaData)) {
            const parsed = parseTrackedLabel(label);
            if (!parsed) continue;
            for (let i = parsed.from; i <= parsed.to; i++) {
              operations.set(i, parsed.summary);
            }
          }
          if (operations.size === 0) operations = null;
        }
      } catch {
        // Non-fatal: sequence output still renders without operation labels.
      }
    }

    setFinalResult(lastOutput ? { kind: lastOutput.kind, data: lastOutput.data, params: lastOutput.params, operations, allResults } : null);
    setRunning(false);
  }

  // Drop handler for dragging an alteration block onto a point-mutations
  // block's mutation list. Translates the structural operation into
  // explicit >p.<pos>.<ref>><alt> strings (Task 9).
  function handleDropOnMutationList(targetUid, sourceUid) {
    const sourceBlock = recipe.find((b) => b.uid === sourceUid);
    if (!sourceBlock) return { error: "Source block not found in recipe." };
    const def = blockById(sourceBlock.defId);
    if (!def) return { error: "Unknown block type." };

    // Only Index-based and Pattern-based blocks produce a sequence diff.
    if (def.category !== "Index-based" && def.category !== "Pattern-based") {
      return { error: `"${def.label}" blocks cannot be translated to point mutations — only Index-based and Pattern-based operations produce a sequence diff.` };
    }

    const before = sourceBlock.beforeSequence;
    const after = sourceBlock.resultData;
    if (!before || !after || typeof before !== "string" || typeof after !== "string") {
      return { error: "No before/after sequence data available for this block. Run the recipe first so the block's effect can be captured." };
    }

    const { mutations, error } = diffToPointMutations(before, after);
    if (error) return { error };
    if (mutations.length === 0) {
      return { error: "This operation produced no base-level changes — nothing to append." };
    }

    // Append the mutations to the target block's rows.
    setRecipe((r) =>
      r.map((b) => {
        if (b.uid !== targetUid) return b;
        const existingRows = b.params.rows || [];
        const newRows = mutations.map((m) => {
          const parsed = parseMutation(m);
          return parsed ? { position: parsed.position, ref: parsed.ref, alt: parsed.alt } : null;
        }).filter(Boolean);
        return { ...b, params: { ...b.params, rows: [...existingRows, ...newRows] } };
      })
    );
    return { error: null };
  }

  // Drop handler for dragging a block straight out of the library (never
  // added to the recipe, so it has no before/after diff to translate yet --
  // item 1). Adds it to the recipe right before the target scoring block and
  // tells the user to Bake, then drag it again from the recipe stack (the
  // path handleDropOnMutationList above already handles) to actually append
  // its mutations.
  function handleDropLibraryBlockOnMutationList(targetUid, libraryBlockId) {
    const def = blockById(libraryBlockId);
    if (!def) return { error: "Unknown block type." };
    if (def.category !== "Index-based" && def.category !== "Pattern-based") {
      return { error: `"${def.label}" blocks cannot be translated to point mutations — only Index-based and Pattern-based operations produce a sequence diff.` };
    }
    const targetIndex = recipe.findIndex((b) => b.uid === targetUid);
    addBlock(libraryBlockId, targetIndex === -1 ? recipe.length : targetIndex);
    return {
      error: `"${def.label}" was added to your recipe. Bake, then drag it from the recipe stack (not the library) onto this field to append its mutations.`,
    };
  }

  return html`
    <div class="pipeline-view">
      <div
        class="pipeline-view__columns"
        ref=${columnsRef}
        style=${`grid-template-columns: ${libraryWidth}px ${HANDLE_WIDTH}px ${recipeWidth}px ${HANDLE_WIDTH}px ${outputWidth}px`}
      >
        <aside class="pipeline-view__library panel">
          <h3 class="panel__title">Operations</h3>
          <${BlockLibrary} onAdd=${(id) => addBlock(id)} />
        </aside>

        <div class="pipeline-view__resize-handle" onMouseDown=${(e) => startResize("library", e)}></div>

        <section class="pipeline-view__recipe panel">
          <h3 class="panel__title">Recipe</h3>
          <button class="btn btn--primary recipe__bake-btn" disabled=${running || !ws.sessionId || recipe.length === 0} onClick=${bake}>
            ${running ? "Baking…" : "Bake ▶"}
          </button>
          ${!ws.sessionId ? html`<p class="output-panel__hint">Load a sequence above to enable execution.</p>` : null}
          <div class="recipe-stack scroll-y" onDragOver=${handleStackDragOver} onDrop=${handleStackDrop} onDragLeave=${handleStackDragLeave}>
            ${recipe.flatMap(
              (block, index) => [
                html`<div key=${`gap-${block.uid}`} class="recipe-gap ${overIndex === index ? "recipe-gap--active" : ""}"></div>`,
                html`
                  <${RecipeBlock}
                    key=${block.uid}
                    block=${block}
                    def=${blockById(block.defId)}
                    index=${index}
                    onParamsChange=${updateParams}
                    onRemove=${removeBlock}
                    onToggle=${toggleBlock}
                    onDropOnMutationList=${handleDropOnMutationList}
                    onDropLibraryBlock=${handleDropLibraryBlockOnMutationList}
                    dragHandlers=${{ ...dragHandlers, isOver: overIndex === index }}
                  />
                `,
              ]
            )}
            <div
              class="recipe-stack__tail ${overIndex === recipe.length ? "recipe-block--drop-target" : ""}"
              onDragOver=${(e) => {
                e.preventDefault();
                setOverIndex(recipe.length);
              }}
              onDragLeave=${() => setOverIndex(null)}
              onDrop=${handleTailDrop}
            >
              drop operation blocs here
            </div>
          </div>
        </section>

        <div class="pipeline-view__resize-handle" onMouseDown=${(e) => startResize("output", e)}></div>

        <div class="pipeline-view__output-col">
          <div class="pipeline-view__session">
            <${SessionBar} compact />
          </div>
          <section class="pipeline-view__output panel">
            <h3 class="panel__title">Output</h3>
            ${running ? html`<button type="button" class="btn btn--danger btn--small output__stop-btn" onClick=${() => { cancelRef.current = true; }}>Stop</button>` : null}
            ${running ? html`<${Spinner} label="Running recipe…" />` : null}
            <${OutputPanel} result=${finalResult} />
          </section>
        </div>
      </div>
    </div>
  `;
}
