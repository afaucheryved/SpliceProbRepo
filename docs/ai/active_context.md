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
  - Key chosen: `"{1-based step index}: {entry['mutation']['human']}"` (e.g. `"1: insert:aaaa@3"`, `"2: mutate_independently"`) — `mutation.human` alone is not unique across a session: `"mutate_independently"` is the literal same string on every random-mutation call, and repeating the same insert/delete twice repeats its label too, so a plain dict keyed by label silently dropped all but the last occurrence of a repeated label (**caught and fixed during Task 3** while wiring up the Compare proposal — a duplicate-`mutate_independently` smoke test confirmed both entries now survive). The step-index prefix keeps it human-readable while guaranteeing uniqueness and encoding chronological order.
  - `proba_simple` was **not** removed by Task 1 — it's already cached per-entry in Redis, so no recomputation needed. Only `"altered sequence"` had to be added per entry to match `/get/simpleproba`'s response shape.
  - Added `reconstruct_altered_sequence_history()` to `app/domain/mixins.py` (factored the existing per-entry replay logic out of `reconstruct_altered_sequence()` into a shared `_apply_single_alteration()` helper first) to get the intermediate altered-sequence string at each tracked step, not just the final one.
  - Behavior change while refactoring: `_apply_single_alteration()` no longer short-circuits the whole reconstruction on hitting a `mutate_independently` entry — it falls back to the stored `current_altered_sequence` for that step and keeps replaying any later entries from there, instead of abandoning them. `reconstruct_altered_sequence()`'s final return value is unchanged for every existing test (all 13 `test_mixins.py` tests still pass unmodified); this only changes behavior for sessions with entries *after* a random mutation, which no prior test covered.
  - **Files modified:** `app/router/get_router.py` (new endpoint + imports), `app/domain/mixins.py` (refactor + new `reconstruct_altered_sequence_history()`).
  - **Verified:** `pytest app/test/test_mixins.py` — 13/13 pass. Full suite `pytest app/test/` — 33 passed / 43 failed, and the 43 failures are byte-for-byte the same pre-existing set that fails on a clean `git stash` of this session's changes (confirmed by diffing failure lists) — i.e. no regressions. Live end-to-end smoke test via `TestClient` on `app.main.app`: `/GetSimpleProb/` → `/altbyindex/insert` → `/altbyindex/delet` → `GET /get/allsimpleprobas`, with real (non-mocked) SpliceAI output, returned `{"insert:aaaa@3": {...}, "delete:2": {...}}`, each entry shaped `{acceptor_proba, donor_proba, "altered sequence"}` matching `/get/simpleproba`'s shape.
  - **Note for Judge:** `GET /get/simpleproba` on this same live session returned `{}` (empty) — pre-existing, unrelated bug where `gv.there_is_change` is apparently false after an index-based alteration, so it skips recomputation and returns the default empty `proba_simple`. Not touched — out of scope for Task 2, flagging in case it's useful for `audits_history.md`.

  **Judge verdict (2026-07-09): `[FAILED]`.** The per-entry `"altered sequence"` field (populated via `reconstruct_altered_sequence_history()`) is silently wrong whenever a session contains a bounded delete (`end`/`length` given) or a non-default-length insert/move/copy-paste — confirmed via live `TestClient` reproduction (3 cases: bounded delete, non-default-length insert, non-default-length move — all produced sequences differing from `GET /get/alteredsequence`'s ground truth, sometimes badly). Root cause: `_track_alteration()`'s human-readable labels (`delete:{start}`, `insert:{pattern}@{index}`, `move:{start}-{end}->@{index}`, `copy_paste:{start}-{end}@{index}`) don't encode every parameter the original call used, and `_apply_single_alteration()` (Task 1, `app/domain/mixins.py`) assumes the default/simplest case. Full root-cause, repro steps, and fix options logged in `docs/ai/audits_history.md` → "Judge Review — Tasks 2–4". `acceptor_proba`/`donor_proba` are unaffected (cached, correct) — only the `"altered sequence"` field is wrong, and no current frontend code (Task 3) reads it, so this hasn't surfaced in the UI, but the endpoint's public contract is broken. Routed back to `[WORKER]` — do not re-close this task without extending `test_mixins.py` to cover bounded-delete/non-default-length cases first.

### Frontend

- [x] **Task 3 — Surface `/get/allsimpleprobas` in all three frontend proposals**
  Blocked on Task 2's response contract being finalized.
  - `frontend/src/api/client.js`: add `api.get.allSimpleProbas(sessionId)`.
  - **Pipeline** (`frontend/src/views/pipeline/`): expose via a new recipe block, or an option on the existing "Point Mutations → Baseline Probability" block (`point_mutations_simple` in `blockDefinitions.js`), whose output renders one chart/entry per tracked mutation.
  - **Workbench** (`frontend/src/views/dashboard/`): surface as a new panel, or an extension of `panels/HistoryLog.js` / `panels/DeltaSummary.js`, listing baseline probability per tracked alteration.
  - **Compare** (`frontend/src/views/comparative/`): natural fit for the existing ranked-table/batch pattern (`RankingTable.js`, `ManhattanChart.js`) — add as an alternate data source alongside the current per-mutation delta-scoring batch flow.

  **Implemented, pending review (2026-07-09):**
  - `client.js`: added `api.get.allSimpleProbas(sessionId)`.
  - **Pipeline**: new zero-field block `tracked_alterations_simple` ("Tracked Alterations → Baseline Probability") in `blockDefinitions.js`, running `workspace.fetchAllSimpleProbas()` (new method in `workspace.js`). Chose a new block over overloading `point_mutations_simple` — that block's `rows` field is a user-typed point-mutation list (an ephemeral probe against the baseline), semantically different from replaying the session's own tracked alteration history, so folding both into one block/field schema would have been confusing. New `outputKind: "probaHistory"` renders via new `ProbaHistoryOutput` in `OutputPanel.js` — one Chart.js line chart per tracked entry, chronological. `PipelineView.js`'s `summarize()` got a matching case.
  - **Workbench**: extended `panels/HistoryLog.js` with a `TrackedProbabilities` subsection (button-triggered fetch, not auto-polling) listing each tracked alteration's label plus peak acceptor/donor value+position. Deliberately *not* matched positionally/by-label against the client-side `ws.history` array — kept as an independent fetch of the backend's own record, since the two lists track different things (client history includes probe/error/init entries the backend never sees) and coupling them by array order felt fragile for a Worker-authored fix I can't visually re-verify (see verification note below).
  - **Compare**: added a `SegmentedControl`-based "Data Source" toggle (`SOURCE_OPTIONS`: `delta` batch-mutations vs `proba` tracked-alterations) to `ComparativeView.js`. New `loadTrackedAlterations()` fetches `/get/allsimpleprobas` and maps entries into the same row shape `runBatch()` produces, unified as `{ mutation, position, acceptorSum, donorSum, totalAbs, kind: "delta"|"proba", resultData }` (renamed from the old delta-only `deltaData` field). `RankingTable.js` and `ManhattanChart.js` now take an optional `mode` prop to swap column/axis labels ("Σ|Δ| acceptor" vs "Σ acceptor proba", etc.) since the two metrics aren't both "delta". `DetailChart.js` now branches on `row.kind` to pick `flattenDeltaTrack` vs `flattenProbaTrack`. `ExportBar.js` CSV headers were genericized (`acceptor_sum_abs_delta` → `acceptor_sum`) since they're now shared by both modes. Added `SegmentedControl`'s `ariaLabel` prop (defaults to the existing "Frontend proposal" so the top-level toggle is unaffected) so this second, differently-purposed toggle doesn't misreport itself to a screen reader.
  - Position for tracked-alteration rows is best-effort, parsed from the label via `positionFromTrackedLabel()` (e.g. `insert:aaaa@3` → 3, `move:3-6->@10` → 10, `delete:2` → 2); operations with no single inherent position (`replace:...`, `delete_by_pattern:...`, `mutate_independently`) fall back to 0 — same spirit as the backend's own best-effort `reconstruct_altered_sequence`.
  - **Files modified:** `frontend/src/api/client.js`, `frontend/src/lib/workspace.js`, `frontend/src/views/pipeline/{blockDefinitions.js,OutputPanel.js,PipelineView.js,pipeline.css}`, `frontend/src/views/dashboard/panels/HistoryLog.js`, `frontend/src/views/dashboard/dashboard.css`, `frontend/src/views/comparative/{ComparativeView.js,DetailChart.js,ManhattanChart.js,RankingTable.js,ExportBar.js,comparative.css}`, `frontend/src/components/shared/SegmentedControl.js`.
  - **Verified:** this project has no build step, bundler, or test suite for the frontend (plain ES modules loaded via CDN, per `frontend/README.md`), and this sandbox has neither `node` nor a browser-automation tool (`chromium-cli`/Playwright all absent) — so unlike prior frontend work in this repo, I could not screenshot the running UI. Instead: (1) started the real backend + `frontend/serve.py` proxy on scratch ports, confirmed every edited file is served byte-for-byte intact (rules out truncation/encoding mistakes from editing); (2) replayed the *exact* HTTP call sequence each new code path issues (`resetgv` → `altbyindex/insert` → `altbyindex/delete`/`mutateindependently` ×2 → `get/allsimpleprobas`) through the real proxy, including a deliberate duplicate-label case to confirm the Task 2 key fix; (3) mirrored `positionFromTrackedLabel()` / `flattenProbaTrack()` / `sum()` in a standalone Python script against the real returned JSON to confirm the client-side transform logic is correct for the actual response shape; (4) manually re-read every edited `htm` template literal for balanced tags/interpolation. **Not done:** actual DOM rendering / visual check in a browser — recommend the human developer open all three proposals once before merging, or run `/run-skill-generator` to capture a working browser-driven check for this repo (there wasn't one, and neither `node` nor a browser was available in this sandbox to improvise one beyond the HTTP-level checks above).

  **Judge verdict (2026-07-09): `[DONE]`.** Reviewed all listed files plus `SegmentedControl.js`'s new `ariaLabel` prop (default preserves the existing 3-proposal switcher's accessibility label). Confirmed no stale `deltaData` references remain after the `deltaData`→`resultData` rename (repo-wide grep). Confirmed this task does **not** read the `"altered sequence"` field from `/get/allsimpleprobas` (only `acceptor_proba`/`donor_proba`), so it is unaffected by Task 2's `[FAILED]` bug (see above / `audits_history.md`). Same sandbox tooling caveat as the Worker noted — no live DOM check possible; recommend a human open all three proposals once before the next release.

- [x] **Task 4 — Pipeline proposal (CyberChef-style) layout/UX fixes**
  Scope limited to `frontend/src/views/pipeline/` (`PipelineView.js`, `RecipeBlock.js`, `BlockForm.js`, `pipeline.css`). Independent of Tasks 1–3.
  1. **Drop-zone coverage**: the recipe stack currently only accepts a drop on individual `RecipeBlock` rows plus the thin `.recipe-stack__tail` strip at the bottom. Extend the drag-and-drop handlers so the entire `.recipe-stack` container — including empty space around/below blocks — accepts a drop, not just block edges or the trailing strip.
  2. **Recipe block input width**: reduce the width of `BlockForm` input fields (`.field input`, `.field select`) inside each recipe block (`.recipe-block`) to about **one third of their current width** (interpreting "reduce by two-thirds" as new width ≈ original × 1/3 — confirm this interpretation before implementing if unsure).
  3. **Input/output layout**: the raw-sequence textarea currently lives in `SessionBar.js`, rendered full width above the entire 3-column layout (`.pipeline-view__session`). Restructure so this input sits directly above the **Output** column (`.pipeline-view__output`) specifically, matching its width/size, instead of spanning the full page width. Session metadata (session ID badge, "Start new session" button) must remain accessible — relocate rather than remove.
  4. **Collapsible recipe blocks**: add a chevron toggle ("▼" expanded / "▶" collapsed) to each `RecipeBlock` header that hides/shows the block's `BlockForm` body, so a collapsed block shows only its header row (title, status icon, enable checkbox, remove button).

  **Implemented, pending review (2026-07-09):**
  - **Sub-task 1 (drop-zone coverage):** added `handleStackDragOver`/`handleStackDrop`/`handleStackDragLeave` on the `.recipe-stack` container in `PipelineView.js`, wired alongside the existing per-block and tail-strip handlers. Each is guarded with `e.target !== e.currentTarget` so a drop that bubbles up from a child (a `RecipeBlock` row or the tail strip) doesn't get double-handled — the container-level fallback only fires when the pointer is directly over empty container space (e.g. below the tail strip in a tall/short-recipe scroll area), and behaves like the tail (append-to-end / reorder-to-end).
  - **Sub-task 2 (input width):** rather than a blanket `.recipe-block .field input` rule (which would have also shrunk the already-narrow, purpose-sized `matrix4x4`/`mutationList` field inputs via higher specificity), added a `field__control` class to the three plain field components in `BlockForm.js` (`TextField`, `IntField`, `SelectField` — this includes the `sequence`-type text field, per the task's literal wording "`.field input`, `.field select`" with no type exclusion). CSS: `.recipe-block .field__control { width: 33%; min-width: 3.5rem; align-self: flex-start; }` in `pipeline.css`.
  - **Sub-task 3 (layout):** moved `<SessionBar compact />` out of the old full-width `.pipeline-view__session` row and into a new `.pipeline-view__output-col` flex-column wrapper that also contains the `.pipeline-view__output` panel — this wrapper is the grid's 3rd column, so the session bar now naturally matches the output column's width. Used `SessionBar`'s existing `compact` prop (already supported by the shared component, shrinks the textarea to 2 rows / 180px min-width) since the column is narrower than the old full-page-width placement. Session ID badge and "Start new session" button are unchanged internals of `SessionBar` — nothing was removed, only relocated. `.pipeline-view__output` gained explicit `flex: 1; min-height: 0` since it's no longer a direct grid child (grid's implicit stretch no longer applies).
  - **Sub-task 4 (collapsible blocks):** added local `useState` in `RecipeBlock.js` (collapse state is per-block-instance, not persisted in the parent `recipe` array — deliberate, since it's pure UI state with no reason to survive a block being removed/re-added, and Preact preserves it correctly across re-renders via the existing `key=${block.uid}` on each `RecipeBlock`). Collapsed state hides the summary paragraph, `BlockForm`, error, and result lines; header (drag handle, new chevron button, status icon, title, category, enable checkbox, remove button) always stays visible, matching the spec.
  - **Files modified:** `frontend/src/views/pipeline/PipelineView.js`, `RecipeBlock.js`, `BlockForm.js`, `pipeline.css`. No files outside `frontend/src/views/pipeline/` touched, respecting Task 4's scope note.
  - **Verified:** same sandbox constraints as Task 3 (no `node`, no browser-automation tool). Checked: (1) brace/paren/bracket balance across all three edited `.js` files (`python3` count check, all matched); (2) started `frontend/serve.py` on a scratch port and diffed the four edited files' served bytes against disk — all four served intact, byte-for-byte; (3) manually re-traced the drag-and-drop guard logic (target-vs-currentTarget) and the collapse-state render branch against Preact/`htm` semantics. **Not done:** actual DOM rendering / visual/drag-and-drop check in a browser — same recommendation as Task 3, a human should open the Pipeline proposal once before merging to confirm the layout, collapse toggle, and drop-zone coverage behave as intended.

  **Judge verdict (2026-07-09): `[DONE]`.** Re-reviewed independently of the Worker's self-report: drop-zone container fallback is correctly guarded (`e.target === e.currentTarget`) so it can't double-fire when a drop bubbles up from a child row or the tail strip; width reduction is scoped via a new `field__control` class that deliberately excludes the matrix/mutation-list fields (checked their dedicated CSS widths are untouched); layout restructure correctly nests `SessionBar`(`compact`) + Output panel under one flex column so widths match, and `SessionBar`'s internals (session ID badge, "Start new session" button) are relocated, not removed; collapse state is local per-`RecipeBlock` via `useState`, which is the right call since it's pure UI state with no reason to live in the `recipe` array. Scope respected — no files outside `frontend/src/views/pipeline/` touched. Same sandbox tooling caveat as Task 3.

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
