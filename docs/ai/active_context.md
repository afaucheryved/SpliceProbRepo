# Active Context

## Current Objectives

Task list authored for execution by lightweight/"flash" LLM agents. Each task
has been checked for technical soundness and reworded against the project's
actual terminology (endpoint names, file paths, component names) before
being handed off — see the notes under each task for what was clarified or
revised and why. **Execution order matters**: Task 1 before Task 2 (Task 2
reads the Redis structure Task 1 changes), Task 2 before Task 3 (Task 3
consumes Task 2's response contract). Task 4 is independent and can be done
in any order.

### Backend

- [ ] **Task 1 — Compact Redis storage for altered-sequence history (revised — see rationale)**

  **Original request, verbatim intent:** store the base sequence only in one-hot format, and store altered sequences only as mutation diffs relative to the base sequence, for memory efficiency.

  **Revision — do NOT store the base sequence only in one-hot format; this part of the original request is not technically sound:**
  - One-hot encoding turns a length-*n* ACGT string into an `[n, 4]` float array — several times larger than the text it replaces (larger still once JSON-serialized, which is how Redis values are currently stored via `app/services/redis_session.py`). Making one-hot the *only* stored form of the base sequence would **increase** memory usage, not reduce it.
  - The one-hot form cannot be used directly by `IsValid`, `AlterationFunctionsByIndex`, `AlterationFunctionsByPattern`, `apply_mutations()`, or any regex/pattern matching (`AlterationFunctionsByPattern._pattern_to_regex`) — all of these operate on the raw ACGT string. Storing only one-hot would force a decode-to-text step before nearly every operation.
  - **Corrected objective:** `session:{id}:base_sequence` stays plain ACGT text (already the case — no change needed there). One-hot encoding remains a *derived, on-demand* representation computed only when calling the SpliceAI model (as `SpliceAIModels._one_hot_encoder()` / `one_hot_encoder()` in `app/domain/spliceai_calculation.py` already do), never persisted as a canonical storage form.

  **The actual memory problem to fix (identified while reviewing this task, and the real target of "more memory-efficient" from the original request):** `AlteredSequenceTrackerMixin._track_alteration()` (`app/domain/mixins.py`) currently appends a **full one-hot-encoded array** (`entry["one_hot"]`) to the session's `session:{id}:altered_sequences` list on *every* alteration call (insert, delete, move, copy-paste, replace, delete-by-pattern, random mutation). With the default `context=10000` padding this is on the order of 20,000+ positions × 4 channels of floats, **per call**, growing unbounded for the life of a session. This is the concrete thing to eliminate.

  **Sub-tasks (breakdown):**
  1. In `app/domain/mixins.py::AlteredSequenceTrackerMixin._track_alteration()`, stop persisting the `one_hot` array into `altered_sequences` history entries. One-hot arrays must only exist transiently, in memory, for the duration of a single model call.
  2. Redefine each `session:{id}:altered_sequences` entry to hold only the mutation label already derived via `tuple_mutation()` (`entry["mutation"]["splicing"]`, using the existing `>p.<pos>.<ref>><alt>` syntax defined by `app/schemas/typing.py::mut`) plus the existing human-readable label (`entry["mutation"]["human"]`, e.g. `"delete:12"`, `"insert:acgt@5"`). Keep `entry["proba_simple"]` as-is for now — flag, but do not remove, if profiling later shows it's also a significant contributor.
  3. Add a helper (e.g. `reconstruct_altered_sequence(base_sequence: str, session_id: str) -> str`) that transparently rebuilds the current full altered sequence from `base_sequence` + the tracked history, producing the exact same string `session:{id}:current_altered_sequence` holds today.
  4. Keep every existing external contract unchanged: `create_internal_variant()` must still set `gv.altered_sequence` to the correct full string; `GET /get/alteredsequence` must still return the full string; no call site outside this mixin (e.g. `app/domain/sequence_functions.py`, which reads/writes `self.altered_sequence` directly) should need modification.
  5. Known constraint to respect, not work around: the `>p.<pos>.<ref>><alt>` syntax only represents same-position, same-length substitutions. Structural edits (insert/delete/move/copy-paste) change sequence length and cannot be expressed as a pure position/base diff against the base sequence. For these, replaying the already-tracked `human` operation label is the correct compact representation — do not invent a new diff format to force structural edits into the substitution syntax.
  6. Add/update tests confirming (a) reconstructed sequences match what was returned before this change, for every alteration type, and (b) the serialized size of `session:{id}:altered_sequences` is reduced.

- [ ] **Task 2 — Add `GET /get/allsimpleprobas`: baseline probabilities for every tracked altered-sequence version**

  **Applicability check performed (per the original note's condition):** `GET /get/simpleproba` (`app/router/get_router.py`) returns a single `gv.proba_simple` dict for only the session's *current* altered sequence — it does not enumerate alteration history. This task is not redundant with an existing endpoint and should proceed.

  **Naming correction:** align with the existing `/get/*` accessor family (`/get/sequence`, `/get/simpleproba`, `/get/deltaproba`, `/get/mutations`, `/get/alteredsequence`), all registered in `app/router/get_router.py` under the `/get` prefix. Implement as `GET /get/allsimpleprobas` (not the flat `/getallsimpleprobas` spelling from the original note), taking the same `session_id` query parameter as its siblings.

  **Behavior:** for the given session, return one baseline-probability result — identical shape to a single `/get/simpleproba` response (`acceptor_proba`, `donor_proba`, `"altered sequence"`) — per entry in `session:{id}:altered_sequences`, keyed by that entry's mutation label. Decide during implementation whether the key is `entry["mutation"]["human"]` or `entry["mutation"]["splicing"]` (or both), favoring whichever is the more stable/unique identifier.

  **Dependency:** reads the same `session:{id}:altered_sequences` structure Task 1 restructures. Implement Task 1 first, or coordinate so this endpoint reads whatever field Task 1 leaves in place for the per-entry `proba_simple` (recompute on demand from the reconstructed sequence if Task 1 ends up removing it).

### Frontend

- [ ] **Task 3 — Surface `/get/allsimpleprobas` in all three frontend proposals**
  Blocked on Task 2's response contract being finalized.
  - `frontend/src/api/client.js`: add `api.get.allSimpleProbas(sessionId)`.
  - **Pipeline** (`frontend/src/views/pipeline/`): expose via a new recipe block, or an option on the existing "Point Mutations → Baseline Probability" block (`point_mutations_simple` in `blockDefinitions.js`), whose output renders one chart/entry per tracked mutation.
  - **Workbench** (`frontend/src/views/dashboard/`): surface as a new panel, or an extension of `panels/HistoryLog.js` / `panels/DeltaSummary.js`, listing baseline probability per tracked alteration.
  - **Compare** (`frontend/src/views/comparative/`): natural fit for the existing ranked-table/batch pattern (`RankingTable.js`, `ManhattanChart.js`) — add as an alternate data source alongside the current per-mutation delta-scoring batch flow.

- [ ] **Task 4 — Pipeline proposal (CyberChef-style) layout/UX fixes**
  Scope limited to `frontend/src/views/pipeline/` (`PipelineView.js`, `RecipeBlock.js`, `BlockForm.js`, `pipeline.css`). Independent of Tasks 1–3.
  1. **Drop-zone coverage**: the recipe stack currently only accepts a drop on individual `RecipeBlock` rows plus the thin `.recipe-stack__tail` strip at the bottom. Extend the drag-and-drop handlers so the entire `.recipe-stack` container — including empty space around/below blocks — accepts a drop, not just block edges or the trailing strip.
  2. **Recipe block input width**: reduce the width of `BlockForm` input fields (`.field input`, `.field select`) inside each recipe block (`.recipe-block`) to about **one third of their current width** (interpreting "reduce by two-thirds" as new width ≈ original × 1/3 — confirm this interpretation before implementing if unsure).
  3. **Input/output layout**: the raw-sequence textarea currently lives in `SessionBar.js`, rendered full width above the entire 3-column layout (`.pipeline-view__session`). Restructure so this input sits directly above the **Output** column (`.pipeline-view__output`) specifically, matching its width/size, instead of spanning the full page width. Session metadata (session ID badge, "Start new session" button) must remain accessible — relocate rather than remove.
  4. **Collapsible recipe blocks**: add a chevron toggle ("▼" expanded / "▶" collapsed) to each `RecipeBlock` header that hides/shows the block's `BlockForm` body, so a collapsed block shows only its header row (title, status icon, enable checkbox, remove button).

## Previous Objectives (superseded)
`fastapi run app/main.py` now boots and serves correctly end-to-end (verified
with `python test_payloads.py`, 11/11 endpoints + 6/6 GET accessors passing
with real SpliceAI output). A three-proposal frontend MVP was added under
`frontend/`. Only the `pattern_in_zona` function is not yet fully operational, but don't worry about it for the moment.

### Completed Tasks

## Current Working Files

## Recent Changes
| Date | Change | Files Affected |
|------|--------|---------------|

## Next Steps (Future / Optional)
- Refactor `InternalGeneticVariant` mega-class: 9-parent multiple inheritance → consider composition
- Fix spelling inconsistency: `independant_gv_schema.py` uses French spelling
- Expose Acceptor Loss and Donor Loss SpliceAI scores
- Add batching support for multiple sequences in a single request
- Dockerize the application
- Add `/health` endpoint
- Rewrite the ~43 stale tests listed in `docs/ai/progress.md` against current `_mutations_target_attr` semantics

---

*This file is updated at the end of each completed task to reflect the latest project state.*
