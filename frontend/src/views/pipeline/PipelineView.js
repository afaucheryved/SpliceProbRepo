import { html, useState } from "../../lib/preact.js";
import { SessionBar } from "../../components/shared/SessionBar.js";
import { Spinner } from "../../components/shared/Feedback.js";
import { useWorkspace } from "../../lib/workspace.js";
import { BlockLibrary } from "./BlockLibrary.js";
import { RecipeBlock } from "./RecipeBlock.js";
import { OutputPanel } from "./OutputPanel.js";
import { BLOCK_DEFINITIONS, blockById, defaultParams } from "./blockDefinitions.js";

let uidSeq = 0;
const nextUid = () => `blk_${++uidSeq}`;

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

  async function bake() {
    if (!ws.sessionId) return;
    setRunning(true);
    setFinalResult(null);
    setRecipe((r) => r.map((b) => ({ ...b, status: "idle", error: null, resultSummary: null })));

    let lastOutput = null;
    let stopped = false;
    for (const block of recipe) {
      if (stopped) {
        patchBlock(block.uid, { status: "skipped" });
        continue;
      }
      if (!block.enabled) {
        patchBlock(block.uid, { status: "skipped" });
        continue;
      }
      const def = blockById(block.defId);
      patchBlock(block.uid, { status: "running" });
      try {
        const result = await def.run(block.params);
        patchBlock(block.uid, { status: "success", resultSummary: summarize(def, result) });
        lastOutput = { kind: def.outputKind, data: result };
      } catch (err) {
        patchBlock(block.uid, { status: "error", error: err.message || String(err) });
        stopped = true;
      }
    }
    setFinalResult(lastOutput);
    setRunning(false);
  }

  return html`
    <div class="pipeline-view">
      <div class="pipeline-view__session">
        <${SessionBar} />
      </div>
      <div class="pipeline-view__columns">
        <aside class="pipeline-view__library panel">
          <h3 class="panel__title">Operations</h3>
          <${BlockLibrary} onAdd=${(id) => addBlock(id)} />
        </aside>

        <section class="pipeline-view__recipe panel">
          <h3 class="panel__title">
            Recipe
            <button class="btn btn--primary btn--small" disabled=${running || !ws.sessionId || recipe.length === 0} onClick=${bake}>
              ${running ? "Baking…" : "Bake ▶"}
            </button>
          </h3>
          ${!ws.sessionId ? html`<p class="output-panel__hint">Load a sequence above to enable execution.</p>` : null}
          <div class="recipe-stack scroll-y">
            ${recipe.length === 0
              ? html`<div class="recipe-stack__empty">Click or drag an operation from the left to build your recipe.</div>`
              : recipe.map(
                  (block, index) => html`
                    <${RecipeBlock}
                      key=${block.uid}
                      block=${block}
                      def=${blockById(block.defId)}
                      index=${index}
                      onParamsChange=${updateParams}
                      onRemove=${removeBlock}
                      onToggle=${toggleBlock}
                      dragHandlers=${{ ...dragHandlers, isOver: overIndex === index }}
                    />
                  `
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
              drop here to append
            </div>
          </div>
        </section>

        <section class="pipeline-view__output panel">
          <h3 class="panel__title">Output</h3>
          ${running ? html`<${Spinner} label="Running recipe…" />` : null}
          <${OutputPanel} result=${finalResult} />
        </section>
      </div>
    </div>
  `;
}
