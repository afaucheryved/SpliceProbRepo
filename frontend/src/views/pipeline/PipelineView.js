import { html, useState, useRef, useCallback, useMemo } from "../../lib/preact.js";
import { SessionBar } from "../../components/shared/SessionBar.js";
import { Spinner } from "../../components/shared/Feedback.js";
import { useWorkspace, workspace } from "../../lib/workspace.js";
import { api } from "../../api/client.js";
import { parseTrackedLabel } from "../../lib/sequence.js";
import { BlockLibrary } from "./BlockLibrary.js";
import { RecipeBlock } from "./RecipeBlock.js";
import { OutputPanel } from "./OutputPanel.js";
import { BLOCK_DEFINITIONS, defaultParams } from "./blockDefinitions.js";

const MODIFICATION_BLOCK_IDS = [
  "replace_substring",
  "delete_substring",
  "move_substring",
  "copy_paste_substring",
  "replace_motif",
  "delete_motif",
  "random_mutate",
];

const BLOCK_MAP = Object.fromEntries(BLOCK_DEFINITIONS.map((d) => [d.id, d]));

let uidSeq = 0;
const nextUid = () => `blk_${++uidSeq}`;

// Item 6: draggable column boundaries. Floors mirror the layout's previous
// fixed sizes (240px library / 360px recipe / 320px output) so resizing can
// never squeeze a column away entirely.
const HANDLE_WIDTH = 8;
const MIN_LIBRARY_WIDTH = 180;
const MIN_RECIPE_WIDTH = 280;
const MIN_SESSION_HEIGHT = 70;
const MIN_OUTPUT_HEIGHT = 180;

function summarize(def, result) {
  switch (def.outputKind) {
    case "sequence":
      return `→ ${result.length.toLocaleString()} bp`;
    case "proba":
      return "→ baseline probability computed";
    case "probaHistory":
      return `→ ${Object.keys(result ?? {}).length} tracked alteration(s)`;
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
  const [sessionHeight, setSessionHeight] = useState(null);
  const columnsRef = useRef(null);
  const resizeStateRef = useRef(null);
  const cancelRef = useRef(false);

  function handleResizeMove(e) {
    const rs = resizeStateRef.current;
    if (!rs) return;
    const delta = e.clientX - rs.startX;
    if (rs.column === "library") {
      const combined = rs.startLibrary + rs.startRecipe;
      const maxLibrary = Math.max(MIN_LIBRARY_WIDTH, combined - MIN_RECIPE_WIDTH);
      const newLibrary = Math.min(Math.max(MIN_LIBRARY_WIDTH, rs.startLibrary + delta), maxLibrary);
      setLibraryWidth(newLibrary);
      setRecipeWidth(combined - newLibrary);
    } else if (rs.column === "output") {
      const newRecipe = Math.max(MIN_RECIPE_WIDTH, rs.startRecipe + delta);
      setRecipeWidth(newRecipe);
    } else if (rs.column === "session") {
      const colEl = rs.parentEl;
      if (!colEl) return;
      const colRect = colEl.getBoundingClientRect();
      const totalHeight = colRect.height;
      const newSessionHeight = rs.startSession + (e.clientY - rs.startY);
      const maxSession = Math.max(MIN_SESSION_HEIGHT, totalHeight - MIN_OUTPUT_HEIGHT);
      const clamped = Math.min(Math.max(MIN_SESSION_HEIGHT, newSessionHeight), maxSession);
      setSessionHeight(clamped);
    }
  }

  function stopResize() {
    resizeStateRef.current = null;
    window.removeEventListener("mousemove", handleResizeMove);
    window.removeEventListener("mouseup", stopResize);
  }

  function startResize(column, e) {
    e.preventDefault();
    const colEl = column === "session" ? columnsRef.current?.querySelector(".pipeline-view__output-col") : null;
    const sessionEl = colEl?.querySelector(".pipeline-view__session");
    resizeStateRef.current = {
      column,
      startX: e.clientX,
      startY: e.clientY,
      startLibrary: libraryWidth,
      startRecipe: recipeWidth,
      startSession: sessionEl ? sessionEl.getBoundingClientRect().height : (sessionHeight ?? 100),
      parentEl: colEl,
      containerWidth: columnsRef.current?.getBoundingClientRect().width ?? 0,
    };
    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", stopResize);
  }

  const addBlock = useCallback((defId, atIndex) => {
    const idx = atIndex ?? recipe.length;
    const def = BLOCK_MAP[defId];
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
      next.splice(idx, 0, block);
      return next;
    });
  }, []);

  const removeBlock = useCallback((uid) => setRecipe((r) => r.filter((b) => b.uid !== uid)), []);
  const toggleBlock = useCallback((uid) => setRecipe((r) => r.map((b) => (b.uid === uid ? { ...b, enabled: !b.enabled } : b))), []);
  const updateParams = useCallback((uid, params) => setRecipe((r) => r.map((b) => (b.uid === uid ? { ...b, params } : b))), []);

  const patchBlock = useCallback((uid, patch) => {
    setRecipe((r) => r.map((b) => (b.uid === uid ? { ...b, ...patch } : b)));
  }, []);

  const reorder = useCallback((from, to) => {
    setRecipe((r) => {
      const next = [...r];
      const [moved] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, moved);
      return next;
    });
  }, []);

  const dragHandlers = useMemo(() => ({
    onDragStart: (e, index) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
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
  }), [dragIndex]);

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

  const handleBlockAction = useCallback((blockUid, actionKey) => {
    setRecipe((r) => {
      if (actionKey === "dropModifications") {
        const blockIndex = r.findIndex((b) => b.uid === blockUid);
        if (blockIndex === -1) return r;
        const next = [...r];
        const ids = [...MODIFICATION_BLOCK_IDS];
        for (let i = ids.length - 1; i >= 0; i--) {
          const def = BLOCK_MAP[ids[i]];
          next.splice(blockIndex + 1, 0, {
            uid: nextUid(),
            defId: ids[i],
            params: defaultParams(def),
            enabled: true,
            status: "idle",
            error: null,
            resultSummary: null,
          });
        }
        return next;
      }
      return r;
    });
  }, []);

  async function bake() {
    if (!ws.sessionId) return;
    workspace.startCancelSession();
    setRunning(true);
    setFinalResult(null);
    cancelRef.current = false;
    setRecipe((r) => r.map((b) => ({ ...b, status: "idle", error: null, resultSummary: null, progress: null })));

    // If any enabled block is a Sequence Modification block, reset the
    // session so every Bake starts from a clean altered sequence (no
    // accumulated tracked entries from previous Bakes) — see Task 7.
    const hasAlteration = recipe.some(
      (b) => b.enabled && BLOCK_MAP[b.defId].section === "Sequence Modification"
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
      const def = BLOCK_MAP[block.defId];
      const beforeSeq = runningSequence;
      patchBlock(block.uid, { status: "running", progress: null });
      try {
        const progressCb = def.run.length >= 2
          ? (msg) => patchBlock(block.uid, { progress: msg })
          : null;
        const result = await def.run(block.params, progressCb);
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
        const isCancelled = err.message === "Cancelled";
        patchBlock(block.uid, { status: isCancelled ? "cancelled" : "error", error: isCancelled ? null : (err.message || String(err)) });
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
    workspace.clearCancelSession();
  }

  return html`
    <div class="pipeline-view">
      <div
        class="pipeline-view__columns"
        ref=${columnsRef}
        style=${`grid-template-columns: ${libraryWidth}px ${HANDLE_WIDTH}px ${recipeWidth}px ${HANDLE_WIDTH}px 1fr`}
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
                    def=${BLOCK_MAP[block.defId]}
                    index=${index}
                    onParamsChange=${updateParams}
                    onRemove=${removeBlock}
                    onToggle=${toggleBlock}
                    onBlockAction=${handleBlockAction}
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
          <div class="pipeline-view__session" style=${sessionHeight != null ? `height:${sessionHeight}px;overflow:auto;` : ""}>
            <${SessionBar} compact />
          </div>
          <div class="pipeline-view__resize-handle--vertical" onMouseDown=${(e) => startResize("session", e)}></div>
          <section class="pipeline-view__output panel">
            <h3 class="panel__title">Output</h3>
            ${running ? html`<button type="button" class="btn btn--danger btn--small output__stop-btn" onClick=${() => { cancelRef.current = true; workspace.cancelAll(); }}>Stop</button>` : null}
            ${running ? html`<${Spinner} label="Running recipe…" />` : null}
            <${OutputPanel} result=${finalResult} />
          </section>
        </div>
      </div>
    </div>
  `;
}
