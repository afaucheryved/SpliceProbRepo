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

- [x] **Task 1 — Compact Redis storage for altered-sequence history (revised — see rationale)**

  **Sub-tasks completed:**
  1. ✅ `_track_alteration()` no longer persists `one_hot` arrays into `altered_sequences` entries. One-hot encoding is now computed only transiently, in memory, during model calls.
  2. ✅ Each `session:{id}:altered_sequences` entry holds only `proba_simple`, `mutation.human` (e.g. `"delete:12"`, `"insert:acgt@5"`), and `mutation.splicing` (SpliceAI labels for same-length edits).
  3. ✅ `reconstruct_altered_sequence(session_id)` helper added — replays tracked alteration history from Redis to deterministically rebuild the current altered sequence. Falls back to stored `current_altered_sequence` for non-deterministic operations (random mutations, wildcard patterns).
  4. ✅ External contracts unchanged: `create_internal_variant()` still sets `gv.altered_sequence` correctly; `GET /get/alteredsequence` still returns the full string; no call sites outside the mixin were modified.
  5. ✅ Constraint respected: structural edits use `human` label replay, not `>p.<pos>.<ref>><alt>` syntax.
  6. ✅ `test_mixins.py` added — 13 tests covering reconstruction for all 7 alteration types, chained operations, random-mutation fallback, and verification that `one_hot` is not persisted.
  
  **Files modified:**
  - `app/domain/mixins.py` — removed `one_hot` persistence from `_track_alteration()`, added `reconstruct_altered_sequence()` function
  - `app/test/test_mixins.py` — new test file

  **Implementation note (2026-07-09):** After the change, the `_FakeModel._one_hot_encoder()` stub in `test_endpoint_integration.py` is no longer used by `_track_alteration()` (since `one_hot` is no longer computed there). It remains in the stub class for backward compatibility with any other code that may still reference it. The `_FakeModel` class itself is still needed for `my_model.run()` calls.

- [ ] **Task 2 — Add `GET /get/allsimpleprobas`: baseline probabilities for every tracked altered-sequence version**

  **Applicability check performed (per the original note's condition):** `GET /get/simpleproba` (`app/router/get_router.py`) returns a single `gv.proba_simple` dict for only the session's *current* altered sequence — it does not enumerate alteration history. This task is not redundant with an existing endpoint and should proceed.

  **Naming correction:** align with the existing `/get/*` accessor family (`/get/sequence`, `/get/simpleproba`, `/get/deltaproba`, `/get/mutations`, `/get/alteredsequence`), all registered in `app/router/get_router.py` under the `/get` prefix. Implement as `GET /get/allsimpleprobas` (not the flat `/getallsimpleprobas` spelling from the original note), taking the same `session_id` query parameter as its siblings.

  **Behavior:** for the given session, return one baseline-probability result — identical shape to a single `/get/simpleproba` response (`acceptor_proba`, `donor_proba`, `"altered sequence"`) — per entry in `session:{id}:altered_sequences`, keyed by that entry's mutation label. Decide during implementation whether the key is `entry["mutation"]["human"]` or `entry["mutation"]["splicing"]` (or both), favoring whichever is the more stable/unique identifier.

  **Dependency:** reads the same `session:{id}:altered_sequences` structure Task 1 restructures. Implement Task 1 first, or coordinate so this endpoint reads whatever field Task 1 leaves in place for the per-entry `proba_simple` (recompute on demand from the reconstructed sequence if Task 1 ends up removing it).

  **Implemented, pending review (2026-07-09):**
  - Added `GET /get/allsimpleprobas` in `app/router/get_router.py`. Follows the same `create_internal_variant(session_id=...)` pattern as its `/get/*` siblings.
  - Key chosen: `entry["mutation"]["human"]` (e.g. `"insert:aaaa@3"`, `"delete:2"`) — it's always populated (unlike `splicing`, which is empty for any length-changing structural edit), matching the note's "more stable/unique identifier" guidance.
  - `proba_simple` was **not** removed by Task 1 — it's already cached per-entry in Redis, so no recomputation needed. Only `"altered sequence"` had to be added per entry to match `/get/simpleproba`'s response shape.
  - Added `reconstruct_altered_sequence_history()` to `app/domain/mixins.py` (factored the existing per-entry replay logic out of `reconstruct_altered_sequence()` into a shared `_apply_single_alteration()` helper first) to get the intermediate altered-sequence string at each tracked step, not just the final one.
  - Behavior change while refactoring: `_apply_single_alteration()` no longer short-circuits the whole reconstruction on hitting a `mutate_independently` entry — it falls back to the stored `current_altered_sequence` for that step and keeps replaying any later entries from there, instead of abandoning them. `reconstruct_altered_sequence()`'s final return value is unchanged for every existing test (all 13 `test_mixins.py` tests still pass unmodified); this only changes behavior for sessions with entries *after* a random mutation, which no prior test covered.
  - **Files modified:** `app/router/get_router.py` (new endpoint + imports), `app/domain/mixins.py` (refactor + new `reconstruct_altered_sequence_history()`).
  - **Verified:** `pytest app/test/test_mixins.py` — 13/13 pass. Full suite `pytest app/test/` — 33 passed / 43 failed, and the 43 failures are byte-for-byte the same pre-existing set that fails on a clean `git stash` of this session's changes (confirmed by diffing failure lists) — i.e. no regressions. Live end-to-end smoke test via `TestClient` on `app.main.app`: `/GetSimpleProb/` → `/altbyindex/insert` → `/altbyindex/delet` → `GET /get/allsimpleprobas`, with real (non-mocked) SpliceAI output, returned `{"insert:aaaa@3": {...}, "delete:2": {...}}`, each entry shaped `{acceptor_proba, donor_proba, "altered sequence"}` matching `/get/simpleproba`'s shape.
  - **Note for Judge:** `GET /get/simpleproba` on this same live session returned `{}` (empty) — pre-existing, unrelated bug where `gv.there_is_change` is apparently false after an index-based alteration, so it skips recomputation and returns the default empty `proba_simple`. Not touched — out of scope for Task 2, flagging in case it's useful for `audits_history.md`.

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
