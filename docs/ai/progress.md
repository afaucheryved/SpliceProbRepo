# Progress

> **Active work lives here, at the top of this file.** Everything below "## Reference: Feature Catalog & Historical Fix Log" is completed, static reference material — read it only if you need historical context, not to find the next task.

## Task Backlog — "Rubber Window" Analysis Block (planned 2026-07-27)

Authored by `[PLANNER]` from a user request to expose `SpotPositionFunctions.rubber_window()` (`app/domain/genomic_analysis.py`) as a new analysis endpoint plus a matching Pipeline block. Checked against `docs/ai/architecture.md` and the current working tree, including uncommitted changes on top of the already-committed `rubber_window()`/`all_window_size` support (commits `8eca550d`, `392334fd`).

**Scope cut (user decision, 2026-07-27):** a live batch-progress indicator in the frontend (mirroring the backend's `batch # i / N` print) was considered and planned as its own design-decision task (formerly Task 25 — three options: SSE streaming, Redis-backed polling, or client-side chunking), but the user decided not to add this functionality at all. Dropped outright, not deferred — do not re-propose it without a fresh request. The backend's `batch # i / N` print itself stays (harmless server-side logging), it just isn't surfaced to the frontend. Task numbering below skips from 24 straight to 25 for the endpoint (previously Task 26) accordingly.

**Pre-existing uncommitted state found in the working tree (not planned/tracked via this workflow, not yet reviewed by a `[JUDGE]`) — flagging per `.clinerules` §1 rather than silently planning around it:** `git diff` shows further hand-drafted changes since those commits: `genomic_analysis.py`'s `rubber_window()` gained an unused `full_baseline = my_model.run(sequence=sequence)` call, its batch loop got wrapped in a bare `try/except Exception: print("error")`, and two debug `print(...)` calls were added inside the loop; `calcul_function.py`'s `IsValid.test_sequence()` regex widened from `^[ACGTacgt]+$` to `^[ACGTNacgtn]+$`; `app/test/test_functions.py` swapped the `@plot_rubber_window`-decorated test for a new `@write_in_file`-decorated one (writing raw output to `app/test/output/output_rubber_window.txt`) and added a `test_1_delta()` scratch function that references two undefined names (`a`, `b` — both assignment lines are commented out) and is called unconditionally at module level (`print(test_1_delta())`), so running the script directly currently crashes with `NameError` before ever reaching `rubber_window()`; `global_var.py` gained a new `parameters_test_1` fixture. Task 24 builds on top of the *corrected* version of this draft, not a rewrite from scratch.

**Dependency graph:** Task 24 blocks Task 25 blocks Task 26. Strictly sequential.

### Backend (foundational)

- [x] **Task 24 — Fix defects in the already-drafted `rubber_window()` and its manual test script**

  **Scope — the fixes below only. Do not redesign the function's core algorithm, its two tiling modes, or rename `rubber_window`/`SpotPositionFunctions` (already relied on by `test_functions.py` and out of scope):**

  1. **Bare exception swallowing (new in this draft):** the entire batch loop (`genomic_analysis.py` ~L328-347) is now wrapped in `try: ... except Exception: print("error")` — any exception mid-batch (a model error, a malformed window, an out-of-memory batch) is silently discarded and the function implicitly returns `None` instead of `window_scores` or the exception. Callers (a future router, `test_functions.py`) get a `None` that looks like "no windows" rather than a failure. **Flag, don't silently resolve:** decide whether to remove the try/except entirely (let it propagate, matching every other function in this module — `hight_impact_mutation_position()` has no such wrapper) or keep partial-result capture with an explicit error field in the return; default to removing it unless a concrete reason to keep partial results surfaces.
  2. **Dead `full_baseline` call:** `full_baseline = my_model.run(sequence=sequence)` (L303) runs a full-sequence model pass every call but the result is never read anywhere afterward — the function still computes `baseprob_donor`/`baseprob_acceptor` via the pre-existing `get_single_base_score()` calls. Looks like an abandoned refactor attempt (maybe toward reusing full-sequence output as the baseline instead of two single-base calls). Investigate whether this was meant to replace the two `get_single_base_score()` calls (which would change the returned deltas' baseline) before deciding to just delete it — deleting is the safe default if no evidence it was meant to be wired in.
  3. **Debug print cruft:** `print("\n?\n")` (meaningless) and `print((value[exon[1]][2] - baseprob_donor)*baseprob_donor, (value[exon[0]][1] - baseprob_acceptor)*baseprob_acceptor)` (multiplies a delta by a baseline probability — not a documented or otherwise-used quantity) — remove both. The pre-existing `print(f"\n batch # {i//batch_size} / {len(windows)//batch_size +1}")` line stays as server-side logging (no frontend surfacing planned — see this batch's scope-cut note above).
  4. **`IsValid.test_sequence()` regex widened to accept `N`/`n` (`calcul_function.py`):** this validator gates the *user-supplied* sequence on `POST /get/sequence` (`simple_router.py`) and `POST /GetDeltaScore` (`delta_router.py`) — unrelated call sites to `rubber_window()`'s internal masking (which builds its own `"N"`-filled strings post-validation, never re-validated). Widening it means those two endpoints now accept ambiguity-code `N` in any user-submitted sequence, a business-logic change with no connection to this feature. **Flag, don't silently resolve:** looks like scope creep, possibly from testing `rubber_window` output round-tripped through one of those endpoints — confirm with the user whether accepting `N` in user input is an intentional, separate change; if not, revert this line as out of scope for this task.
  5. **`test_functions.py` `test_1_delta()` (new scratch function):** references `a`/`b`, both only assigned in commented-out lines — calling it (it's invoked unconditionally at module scope: `print(test_1_delta())`) raises `NameError` immediately, before the script ever reaches the also-added-but-now-commented-out `test_rubber_window(**parameters_2)` call. This breaks the manual smoke-test path `architecture.md`/`project_brief.md` describe for this script. Either finish `test_1_delta()` (uncomment and fix the two calls it's clearly meant to compare) or delete it, and restore an active (uncommented) call to `test_rubber_window(...)` so the script actually exercises `rubber_window()` when run directly (`python app/test/test_functions.py`).
  6. **No guard against both tiling modes:** `window_size` and `all_window_size` are documented as mutually exclusive, but nothing stops a caller passing both — `all_window_size` silently takes precedence (code checks `if all_window_size is not None` first) and `window_size` is silently ignored. Decide: leave the silent precedence but document it in the docstring's parameter list (currently only explained in the prose above, not next to the parameter itself), or raise if both are given. Low priority — fix after 1-5.

  **Already fixed relative to the first commits (`8eca550d`, `392334fd`) — no action needed:** the `all_window_size` overlapping-tiling mode itself (distinct from the original fixed-`window_size` tiling) and its `troncated_sequences` de-duplication for clamped end-of-sequence windows.

  **Tests:** no dedicated test module exists yet for `rubber_window()` (`test_analysis_regression.py` covers `ImportanceSplicingSearch`/`hight_impact_mutation_position` only). Add coverage mirroring Task 21's approach — monkeypatch `genomic_analysis.my_model.get_single_base_score`/`run_batches` with a deterministic per-character fake — covering: point 1 (an injected exception inside the batch loop propagates/is reported, not silently turned into a `None` return), the two tiling modes each producing the expected window keys for a small sequence, and (once point 6 is decided) the both-given-at-once behavior.

  **Files:** `app/domain/genomic_analysis.py`, `app/domain/calcul_function.py`, `app/test/test_functions.py`, plus a new/extended test file per above.

  **What was done (`[WORKER]`, 2026-07-27):**
  1. Removed the bare `try/except Exception: print("error")` wrapper around the batch loop entirely — exceptions now propagate normally, matching `hight_impact_mutation_position()`'s convention.
  2. Deleted the dead `full_baseline = my_model.run(sequence=sequence)` line — a repo-wide search found no other reference to `full_baseline`, confirming it was an abandoned refactor attempt with no evidence it was meant to replace the existing `get_single_base_score()` baseline calls.
  3. Removed both debug prints (`print("\n?\n")` and the delta×baseline print). Kept the pre-existing `print(f"\n batch # {i//batch_size} / {len(windows)//batch_size +1}")` line as server-side logging only.
  4. **Asked the user directly** (per this task's own "confirm with the user" instruction): confirmed `IsValid.test_sequence()`'s widened `^[ACGTNacgtn]+$` regex is an intentional, separate change — accepting ambiguity-code `N` in user-submitted sequences is wanted, not scope creep. Left `calcul_function.py` untouched.
  5. Deleted the broken `test_1_delta()` scratch function (referenced undefined `a`/`b`). Restored an active (uncommented) `test_rubber_window(**parameters_test_1)` call at module scope — `parameters_test_1` (added to `global_var.py` in the same uncommitted draft) already matches `test_rubber_window`'s `(sequence, exon, batch_size, all_window_size)` signature.
  6. Added a mutual-exclusivity guard: `window_size`'s default changed from `5` to `None`; the function now raises `ValueError("window_size and all_window_size are mutually exclusive; pass only one")` if both are given, and defaults `window_size` to `5` internally only when neither is given. Docstring updated to describe this.

  **Tests added** to `app/test/test_analysis_regression.py` (reusing the existing `_fake_get_single_base_score`/`_fake_run_batches` fixtures — extended `_CHAR_SCORE` with an `"N"` entry since `rubber_window()`'s masked windows now flow through the same fakes): `test_rubber_window_batch_error_propagates` (point 1 — an injected `RuntimeError` from `run_batches` now propagates instead of yielding `None`), `test_rubber_window_fixed_window_size_tiling` and `test_rubber_window_all_window_size_tiling` (each tiling mode produces the expected `(start, end)` window keys on a small sequence), `test_rubber_window_both_tiling_modes_raises` (point 6).

  **Verification:**
  - `pytest app/test/test_analysis_regression.py`: all 4 new tests pass. 3 pre-existing failures remain (`test_zona_uses_internal_gv_for_probability_delta`, `test_hight_impact_mutation_position_interval_matches_full_sequence`, `test_hight_impact_mutation_position_return_shape`) — confirmed via `git stash` (re-ran against the pre-Task-24 code) that these 3 fail identically with or without this task's changes; the latter two are regressions in the *separate*, still-in-flight `hight_impact_mutation_position` draft (unrelated to `rubber_window`), not something this task touched or introduced — flagging for whichever session picks up Task 21/22 review.
  - Full suite (`pytest app/test/ --ignore=app/test/test_functions.py`): 46 failed / 53 passed with this task's changes vs. 46 failed / 49 passed on the pre-Task-24 code (same `git stash` comparison) — identical 46 pre-existing failures, zero regressions, the 4 new tests are the only delta. Note this is 3 more failures than the "43 pre-existing" baseline `hight_impact_mutation_position` review Task 21 recorded on 2026-07-17 — all 3 extra are in `hight_impact_mutation_position`/`_zona` coverage, unrelated to this task, and pre-date it (confirmed via the same stash comparison).
  - **Live smoke test** (real 5-model SpliceAI ensemble, no mocking): `PYTHONPATH=. python app/test/test_functions.py` now runs to completion (exit code 0) — previously impossible, it crashed with `NameError` on `test_1_delta()` before ever reaching `rubber_window()`. With `parameters_test_1` (100bp sequence, `exon=(13,84)`, `all_window_size=[4,12]`, `batch_size=40`) it correctly produced 22 batches, printed `batch # i / 22` for each one, and wrote 840 window entries to `app/test/output/output_rubber_window.txt` in the documented format.

  **Not done / left for Judge or next session:** did not investigate the 46 pre-existing failing tests, including the 2 newly-noticed `hight_impact_mutation_position` regressions mentioned above (out of scope for this task — flagging per `.clinerules` §1). Task 25 (the endpoint) is next — the progress-reporting design task formerly slotted in here was dropped per user decision, see this batch's scope-cut note above.

  **Judge verdict (2026-07-27): `[DONE]`, independently verified.** Confirmed all 6 fixes directly in the code (not just from the Worker's note): try/except removed, dead `full_baseline` line gone (repo-wide grep confirms), debug prints gone with the batch-counter print kept, `N`/`n` regex left untouched per the user's confirmed decision, broken `test_1_delta()` replaced with an active `test_rubber_window(**parameters_test_1)` call, mutual-exclusivity `ValueError` guard present. Independently re-ran the 4 new tests directly, re-ran the full suite and confirmed via `git stash` it's byte-identical to the pre-Task-24 failure set (zero regressions), re-ran the live smoke test end-to-end against the real 5-model ensemble, and additionally constructed and ran a case the Worker didn't try — `interval` combined with each tiling mode — with no bug found. See `docs/ai/audits_history.md` → "Judge Review — Task 24 (Rubber Window batch), 2026-07-27" for full detail. **While investigating the Worker's note that 3 more tests fail than Task 21's documented baseline, found and logged an unrelated but serious regression in `hight_impact_mutation_position()` (Task 21/22, separate batch) — see that same audits_history.md entry and Task 21's re-opened verdict below.**

### Backend

- [ ] **Task 25 — Add `POST /analysis/rubberwindow` endpoint** (blocked by Task 24)

  Wrap `InternalGeneticVariant.rubber_window()` (already available via `SpotPositionFunctions`, the same mixin `hight_impact_mutation_position()` uses) in `app/router/analysis_router.py`, following the exact pattern already used for `/highimpactposition` in the same file: a new `RubberWindowParameters(BaseModel)` with `exon: list[int]`, `interval: list[int] | None = None`, `window_size: int | None = None`, `all_window_size: list[int] | None = None`, `models_used: list[int] | None = None`, `batch_size: int | None = None`, `session_id: str | None = None`; a route handler calling `create_internal_variant(sequence="", mutations=[], session_id=p.session_id)` then `gv.rubber_window(...)`; wrapped in the same try/except-reraise style as `/highimpactposition`. `rubber_window()`'s return dict is keyed by `(start, end)` tuples — Pydantic/FastAPI cannot serialize a tuple dict key as JSON directly (JSON object keys must be strings), so the handler must convert keys to a JSON-safe form (e.g. `f"{start}_{end}"` or a list-of-entries shape) before returning; also cast any `numpy.float32` values to native `float` the same way `/highimpactposition` already does.

  **Performance note:** measure before assuming this is fast enough — `all_window_size` mode is potentially much larger than `/highimpactposition`'s per-base loop (it can produce up to `sequence_length * (n - m + 1)` overlapping windows). Smoke-test with a short sequence first, then time one realistic-length call with a realistic `all_window_size` range before deciding whether `architecture.md` needs a latency caveat (mirroring the existing `/analysis/patterninzona` one). Do not add timeouts, background jobs, or a sequence-length cap speculatively. No progress-reporting support needed — see this batch's scope-cut note above.

  **Files:** `app/router/analysis_router.py`, `docs/ai/architecture.md` (endpoint table row + caveat note once measured).

### Frontend

- [ ] **Task 26 — Add a "Rubber Window" Pipeline block + output chart** (blocked by Task 25)

  Add a new `Analysis`-category entry to `BLOCK_DEFINITIONS` in `frontend/src/views/pipeline/blockDefinitions.js`, modeled on `zone_analysis`: `id: "rubber_window"`, `category: "Analysis"`, `label`/`summary` describing the feature, `fields`: `exon` (two `int` fields or a paired-range field type, no default — required), an optional `interval` (same pattern), `window_size` (`type: "int"`, default `5`) and `all_window_size` (two `int` fields, both defaulting to empty/`null` — mutually exclusive with `window_size` per Task 24 point 6; surface that in the field's label/summary text so users don't set both), `batch_size` (`type: "int"`, default `50`), and `models_used` (`type: "modelSet"`, default `[5]`). Add a new `outputKind` (e.g. `"rubberWindow"`), and `run: (params) => workspace.rubberWindow(params)`.

  Add `rubberWindow(params)` to `frontend/src/lib/workspace.js` (`withBusy()`-wrapped, like `analyzeZones()`) and `analysis.rubberWindow` to `frontend/src/api/client.js`, calling the new `POST /analysis/rubberwindow`.

  Render the result in `OutputPanel.js`: add a new component (e.g. `RubberWindowOutput`) — the response is keyed by masked-window `(start, end)` (or the JSON-safe form Task 25 settles on), each mapping to `{donor, acceptor, subsequence}`; a bar or line chart with two series (donor delta, acceptor delta) indexed by window start (or midpoint), plus the `subsequence` available as a per-point tooltip (mirroring how `SequenceTrack.js`/existing charts surface per-point sequence text). Do not force this through `flattenProbaTrack()` — write the mapping directly against this shape, the same reasoning Task 23 already applied to `hight_impact_mutation_position()`'s response. Use the existing generic `<Spinner label="Running recipe…" />` while the block runs — no live batch-progress indicator (dropped per this batch's scope-cut note above).

  **Files:** `frontend/src/views/pipeline/blockDefinitions.js`, `frontend/src/lib/workspace.js`, `frontend/src/api/client.js`, `frontend/src/views/pipeline/OutputPanel.js`, possibly `frontend/src/views/pipeline/BlockForm.js` if a new paired-range field type is added.

---

## Task Backlog — "High Impact Mutation Position" Analysis Block (planned 2026-07-17, revised 2026-07-17)

Authored by `[PLANNER]` from a user request to expose `SpotPositionFunctions.hight_impact_mutation_position()` (`app/domain/genomic_analysis.py`) as a new analysis endpoint plus a matching Pipeline block, checked against `docs/ai/architecture.md` and the current working tree.

**Pre-existing uncommitted state found in the working tree (not planned/tracked via this workflow, not yet reviewed by a `[JUDGE]`) — flagging per `.clinerules` §1 rather than silently planning around it:** `git diff` shows someone already drafted this feature directly in the working tree: `SpotPositionFunctions`/`hight_impact_mutation_position()` in `genomic_analysis.py`, `SpliceAIModels.get_single_base_score()`/`run_batches()` in `spliceai_calculation.py`, and the mixin wiring in `internal_gv_schema.py` (`InternalGeneticVariant` now inherits `SpotPositionFunctions`). It also modified `pytest.ini` in a way that reintroduces a previously-fixed bug — see Task 21. Task 22/23 build on top of the *corrected* version of this draft, not a rewrite from scratch.

**Revision note (2026-07-17):** the draft changed again after this batch was first planned — it gained an `interval` parameter, switched to a batched execution path (`run_batches()`), and its own loop/off-by-one bugs and its `test_functions.py` naming bugs from the first planning pass are now already fixed. Task 21 below reflects only the defects still present as of this revision; superseded points from the first pass are not repeated here.

**Dependency graph:** Task 21 blocks Task 22 blocks Task 23. Strictly sequential — do not start Task 22 before Task 21 is `[DONE]`, or Task 23 before Task 22 is `[DONE]`.

### Backend (foundational)

- [ ] **Task 21 — Fix remaining defects in the already-drafted `hight_impact_mutation_position()`**

  **Scope — the four fixes below only. Do not redesign the function's core algorithm or naming (do not rename `hight_impact_mutation_position`/`SpotPositionFunctions` — already relied on by `test_functions.py` and out of scope):**

  1. **`interval`/`base` indexing bug (new since the first planning pass):** the signature is now `hight_impact_mutation_position(self, base: int, interval: list[int] | None = None, models_used: set[int] = [1, 2, 3, 4, 5])`. When `interval` is given, `sequence = self.sequence[interval[0]:interval[1]]` — an interval-local slice — but `base` is still used unmodified as `position=base` in `get_single_base_score(sequence=sequence, ...)` and as `probas[base]` when reading batch results, both of which index into that *sliced* `sequence`. `base` is documented as "the base tracked position" (implicitly absolute, within `self.sequence`), so when `interval` is set it must be rebased to `base - interval[0]` before use, and validated to actually fall within `[interval[0], interval[1])` (raise a clear error otherwise — don't silently clip or wrap). Without this fix, any call that passes both `base` and `interval` reads the wrong position's score.
  2. **Docstring/implementation mismatch (new since the first planning pass):** the docstring now documents the return value as a dict nested by numeric key (`{1: {"donor": ..., "acceptor": ...}, 2: {...}}`), but the function body still returns the flat `{"donor": [[A],[C],[G],[T]], "acceptor": [[A],[C],[G],[T]]}` shape from before — no code path builds the nested structure, and a repo-wide search found nothing else (no test, no router, no frontend code) that expects or produces it. **Flag, don't silently resolve:** this reads as a stale/incomplete docstring edit, not a completed feature — default to correcting the docstring to describe the actual flat return shape (Task 23's frontend work is planned against that flat shape, and the implementation is the source of truth here). Only implement an actual nested-by-key return if you find concrete evidence elsewhere that it's genuinely wanted; if unsure, stop and ask rather than guessing at what the keys would even mean.
  3. **`models_used: set[int] = [1, 2, 3, 4, 5]`:** default value is still a `list` literal, not a `set` — inconsistent with its own type hint and with `SpliceAIModels.run()`/`run_batches()`'s `set[int] | None` contract (`app/domain/spliceai_calculation.py`). Harmless at runtime (both recast via `set(...)`), but change the default to a literal `{1, 2, 3, 4, 5}` for consistency. Low priority — fix only after 1 and 2.
  4. **`pytest.ini` regression (unchanged from the first pass, still present):** `addopts = --ignore=app/test/test_functions.py` and `asyncio_mode = auto` are commented out, and `pythonpath = .` was added. This reintroduces the exact bug documented in this file's "Startup & Runtime Fixes (2026-07-07)" section below the reference divider: `test_functions.py` executes real model calls and opens a matplotlib GUI window at import time, crashing `pytest` collection for the whole suite. Restore the `addopts`/`asyncio_mode` lines; keep `pythonpath = .` only if `pytest app/test/` still needs it once `addopts` is restored.

  **Already fixed in the current draft — no action needed, listed here only so the next session doesn't re-flag them:** the original off-by-one loop bounds in `hight_impact_mutation_position()` (now correctly `range(seq_len)` with clean slice-based mutation reconstruction), and `test_functions.py`'s bottom script (now correctly calls `plot_hight_impact_mutation_position`/`hight_impact_mutation_position`, matching the real names).

  **Tests:** add unit coverage for `hight_impact_mutation_position()` (no dedicated test file exists yet for `SpotPositionFunctions` — `app/test/test_analysis_regression.py` covers `ImportanceSplicingSearch` only; a new small test module or an addition there is fine) covering: point 1 (an `interval`-scoped call returns the same score as the equivalent full-sequence call at the corresponding absolute position; an out-of-range `base` for the given `interval` raises clearly) and point 2 (return shape matches the corrected docstring). Mock/monkeypatch the model call the same way `test_analysis_regression.py` already does — do not let a test invoke the real 5-model ensemble.

  **Files:** `app/domain/genomic_analysis.py`, `pytest.ini`, plus a test file per above.

  **What was done (`[WORKER]`, 2026-07-17):** All four fixes applied in `app/domain/genomic_analysis.py`'s `hight_impact_mutation_position()`:
  1. When `interval` is set, `base` is now validated to fall within `[interval[0], interval[1])` (raises `ValueError` otherwise) and rebased to `local_base = base - interval[0]`; `local_base` is used for both the `get_single_base_score(position=...)` baseline call and every `probas[local_base]` read in the batch loop. `base` itself is left untouched/unused past validation.
  2. Docstring's OUTPUT section corrected to the actual flat `{"donor": [...], "acceptor": [...]}` shape (no nested-by-model-number structure found anywhere else in the repo referencing it, per the flag-don't-silently-resolve instruction — went with correcting the docstring, not the implementation).
  3. `models_used` default changed from `[1, 2, 3, 4, 5]` (list) to `{1, 2, 3, 4, 5}` (set literal).
  4. `pytest.ini`: uncommented `addopts = --ignore=app/test/test_functions.py` and `asyncio_mode = auto`; kept `pythonpath = .` (still needed for `pytest app/test/`'s absolute `app.*` imports to resolve).

  **Tests added** to `app/test/test_analysis_regression.py` (new file not needed — appended, per the task's own suggestion): 3 new tests, all monkeypatching `genomic_analysis.my_model.get_single_base_score`/`run_batches` with a deterministic per-character fake (score depends only on the nucleotide at a position, not on absolute vs. interval-local indexing) so interval-scoped and full-sequence results are directly comparable at the corresponding absolute position:
  - `test_hight_impact_mutation_position_interval_matches_full_sequence` — interval `[2, 8]`, `base=5`; asserts `interval_result[...][local_base]` equals `full_result[...][absolute_base]` for both regions and all 4 mutation rows. This is a real regression guard for point 1: before the fix it silently read the wrong index instead of crashing (the buggy raw `base=5` was still in-bounds for the 6-length interval slice), so the old code would have failed this equality check, not raised.
  - `test_hight_impact_mutation_position_out_of_range_base_raises` — `base=1`, `interval=[2, 8]` → asserts `ValueError`.
  - `test_hight_impact_mutation_position_return_shape` — asserts the flat `{"donor", "acceptor"}` shape (4 lists of floats each, length = sequence length) matching the corrected docstring.

  **Verification:** `pytest app/test/test_analysis_regression.py` — all 3 new tests pass. Full suite (`pytest app/test/`, venv at `env/`): 43 failed / 50 passed, and diff-checked against a `git stash` baseline run with the same effective `--ignore` — **same 43 pre-existing failures** (`test_alteration_functions.py`, `test_endpoint_integration.py`, `test_independent_gv.py`, plus the already-broken `test_zona_uses_internal_gv_for_probability_delta` — a typo'd `GeneralServices.result_per_seqences` attribute, unrelated to this task and not touched). Baseline had 47 passed (no `hight_impact_mutation_position` coverage existed yet); this session's 50 passed = same 47 + the 3 new tests. No regressions introduced.

  **Not done / left for Judge or next session:** did not investigate or touch the pre-existing 43 failing tests (out of scope for Task 21 — flagging per `.clinerules` §1 rather than silently fixing or ignoring). Did not run the real 5-model ensemble against `hight_impact_mutation_position()` (no live smoke test) — Task 22's performance-measurement note covers that once the endpoint exists.

  **Judge verdict (2026-07-27): reopened `[FAILED]`.** This Worker session's fixes were sound *at the time* (2026-07-17), but the function was edited again before commit `889e08bb` (2026-07-21, which bundled these Worker changes together with the Task 22 endpoint and a further undocumented change) — it now returns a flat `{"donor": [float, ...], "acceptor": [float, ...]}` (one value per position) instead of the `{"donor": [[A],[C],[G],[T]], "acceptor": [[A],[C],[G],[T]]}` shape this session's own tests assert and Task 22's endpoint code assumes. Confirmed via direct reproduction: `test_hight_impact_mutation_position_return_shape` and `test_hight_impact_mutation_position_interval_matches_full_sequence` (both added here) now fail, and the already-committed `POST /analysis/highimpactposition` crashes on every call (`analysis_router.py`'s serialization step raises `TypeError: 'numpy.float64' object is not iterable`). Also found a second, independent bug in the same function: it never uppercases `self.sequence` before use (unlike `rubber_window()`), so a fully valid lowercase input sequence crashes `acgt()` with `ValueError: Only ACGT is allowed` — caught via the project's own existing `test_endpoint_integration.py::TestAnalysis::test_high_impact_position`. Full root cause, evidence, and fix instructions in `docs/ai/audits_history.md` → "Judge Review — Task 24 (Rubber Window batch), 2026-07-27" (found while investigating an unrelated Task 24 verification note — logged here rather than silently left for a future session to rediscover). Routed back to `[WORKER]`, not fixed by this Judge session.

### Backend

- [ ] **Task 22 — Add `POST /analysis/highimpactposition` endpoint** (blocked by Task 21 — currently broken, see Task 21's reopened verdict above; the endpoint code below does not need rewriting, only re-verifying once Task 21's fix lands)

  Wrap `InternalGeneticVariant.hight_impact_mutation_position()` (already mixed into the mega-class via the working tree's `internal_gv_schema.py` change) in `app/router/analysis_router.py`, following the exact pattern already used for `/patterninzona` in the same file: a new `BaseModel` params class (e.g. `HighImpactMutationPositionParameters` with `base: int`, `interval: list[int] | None = None`, `models_used: list[int] | None = None`, `session_id: str | None = None` — use `list[int]`, not `set[int]`, for the Pydantic field for the same reason `alteration_radom.py`'s `prob_mat` avoids a bare `numpy`/set-like alias, per `docs/ai/architecture.md` §8), a route handler that calls `create_internal_variant(sequence="", mutations=[], session_id=p.session_id)` then `gv.hight_impact_mutation_position(base=p.base, interval=p.interval, models_used=p.models_used)`, wrapped in the same try/except-reraise style as `patterninzona`. No new router file or `main.py` change needed — `analysis_router.py` is already included.

  **Naming note:** keep the underlying Python call as `gv.hight_impact_mutation_position(...)` (the real, already-established — if misspelled — method name; do not rename it, that ripples into `test_functions.py` and is out of scope). The new endpoint *path* and any new public-facing identifiers you introduce are free to use the correct spelling ("high impact"), matching what Task 23 will call from the frontend.

  **Performance note, updated from the first planning pass:** the draft now batches model calls (`run_batches()`, batch size 50) rather than one synchronous call per mutation, so it's likely meaningfully faster than the original per-position implementation — but this hasn't been measured. Don't assume it's now fast enough for a full-length sequence without checking: smoke-test with a short sequence first (tens of bases), then time one realistic-length call before deciding whether `architecture.md` needs a latency caveat (mirroring the existing `/analysis/patterninzona` one) added to its endpoint table. Do not add timeouts, background jobs, or a sequence-length cap speculatively — that's new architecture beyond this task's scope; just measure and document what you find. Mention that `interval` (Task 21) lets a caller scope the analysis to a sub-region for performance — worth noting in the endpoint's own doc/description.

  **Files:** `app/router/analysis_router.py`, `docs/ai/architecture.md` (endpoint table row + caveat note once measured).

### Frontend

- [ ] **Task 23 — Add a "High Impact Mutation Position" Pipeline block + output chart** (blocked by Task 22)

  Add a new `Analysis`-category entry to `BLOCK_DEFINITIONS` in `frontend/src/views/pipeline/blockDefinitions.js`, modeled directly on the existing `zone_analysis` block: `id: "high_impact_position"`, `category: "Analysis"`, `label`/`summary` describing the feature, `fields`: `base` (`type: "int"`, required tracked position — no sensible default), an optional interval (two plain `type: "int"` fields, e.g. `intervalStart`/`intervalEnd`, both defaulting to `null`/empty — check `BlockForm.js`'s field-type registry first in case a paired-range field type already exists before adding two separate ones), and `models_used` (`type: "modelSet"`, default `[5]`, reusing the exact field type `zone_analysis` already uses for `specified_models_used`). Add a new `outputKind` (e.g. `"highImpactPosition"`), and `run: (params) => workspace.highImpactMutationPosition({ base: params.base, interval: (params.intervalStart != null && params.intervalEnd != null) ? [params.intervalStart, params.intervalEnd] : null, models_used: params.models_used })`.

  Add `highImpactMutationPosition(params)` to `frontend/src/lib/workspace.js` — a read-only probe, wrapped in `withBusy()` the same way `analyzeZones()` is. Add `analysis.highImpactMutationPosition` to `frontend/src/api/client.js`, same style as the neighboring `analysis.patternInZona`, calling the new `POST /analysis/highimpactposition`.

  Render the result in `OutputPanel.js`: add a new component (e.g. `HighImpactPositionOutput`), modeled on `ProbaOutput` (same file) — two `Chart` instances (donor, acceptor), each `type: "line"` with **4 datasets** (one per A/C/G/T; reuse the project's existing per-base color convention — check `lib/theme.js` / `SequenceTrack.js` for the already-established A/C/G/T colors rather than inventing new ones). **X-axis labels:** the corrected (Task 21) flat response's arrays are indexed relative to whatever `sequence` the backend analyzed — if the block's `interval` field was set, position `i` in the response corresponds to absolute position `intervalStart + i` in the real sequence, not `i` itself; compute labels as `(intervalStart ?? 0) + index + 1` (1-based, matching every other chart's convention) so the axis reads correctly whether or not `interval` was used. The response shape doesn't match what `flattenProbaTrack()` expects (a `{index: {base: value}}` dict) — write the chart data mapping directly against the flat per-base-array shape rather than forcing it through that helper. No `sequence`/`companionDatasets` chart props needed. Wire the new `outputKind` into `OutputPanel`'s existing `${kind === "..." ? html`<.../>` : null}` dispatch chain.

  **Files:** `frontend/src/views/pipeline/blockDefinitions.js`, `frontend/src/lib/workspace.js`, `frontend/src/api/client.js`, `frontend/src/views/pipeline/OutputPanel.js`, possibly `frontend/src/views/pipeline/BlockForm.js` if a new paired-range field type is added.

---

## Task Backlog — Frontend UX & Critical Fixes (planned 2026-07-09)

Authored by `[PLANNER]` from a batch of user-supplied feature requests, checked against the current codebase (file/component names below are the actual identifiers, not paraphrases) and against `docs/ai/architecture.md`'s documented constraints. Continues the numbering from the previous batch (Task 1–4, now closed — see `docs/ai/active_context.md` history / `docs/ai/audits_history.md`).

**Dependency graph:** Task 5 blocks Task 6 and Task 7. Task 17 blocks Task 18. Tasks 10, 13, and 18 all modify the shared `frontend/src/components/shared/Chart.js` — independent otherwise, but flagged below so whichever lands last verifies no regression against the earlier two. Tasks 6 and 19 both modify `frontend/src/components/shared/SessionBar.js` — same soft-coordination note. All other tasks are independently completable in any order.

### Backend (foundational)

- [x] **Task 5 — Add an in-place session-reset capability to `POST /resetgv`**

  **What was done:** Added `reset_session_state(session_id, new_sequence)` to `app/domain/internal_gv_factory.py`. This function overwrites the session's `base_sequence` (via a new `overwrite` parameter on `_store_base_sequence`), resets `current_altered_sequence`, and clears the `altered_sequences` tracked-history list — all while keeping the same `session_id`. Modified `POST /resetgv` in `app/router/resetgv_router.py` to call it when `session_id` is provided and `sequence` is non-empty; backward-compatible (empty/omitted `sequence` preserves existing reconnect-without-change behaviour, `session_id: null` mints a new session).

  **Tests:** Extended `TestResetGV` in `test_endpoint_integration.py` with 3 new tests: (a) existing session + new sequence → `base_sequence` changes, `altered_sequences` cleared, `session_id` unchanged; (b) existing session + empty sequence → unchanged reconnect (regression guard); (c) `session_id: null` → unchanged mint-new-session (regression guard). **All 4 reset tests pass** (2 existing + 3 new, but one existing was split into the 3 new — net +2 tests).

  **Judge verdict (2026-07-09): `[DONE]`.** Independently re-verified beyond the 3 new tests with a fresh live `TestClient` repro (tracked an alteration, reset in-place, confirmed history cleared and `session_id` unchanged) plus the empty-sequence regression case. See `docs/ai/audits_history.md` → "Judge Review — Tasks 5–8".

  **Files touched:** `app/domain/internal_gv_factory.py`, `app/router/resetgv_router.py`, `app/test/test_endpoint_integration.py`.

### Frontend + Backend

- [x] **Task 6 — Split "Load sequence" from "Start new session" in `SessionBar.js`**

  **What was done:** Added `workspace.loadSequenceIntoSession(sequence)` to `frontend/src/lib/workspace.js` — calls `POST /resetgv` with the existing `session_id` and new sequence (Task 5's in-place-reset path), keeping the same session. Rewrote `SessionBar.js` to always show two distinct, always-visible buttons: "Load sequence" (disabled when no session exists, with tooltip explaining why) and "Start new session" (always enabled, mints a fresh session). Pipeline's compact layout wraps gracefully via existing `flex-wrap: wrap` — no CSS changes needed.

  **Judge verdict (2026-07-09, re-attempt 2026-07-10): `[DONE]`.** Disabled "Load sequence" tooltip fixed to "No active session yet — click 'Start new session' first" — no longer circular. Re-verified the fix landed exactly as instructed. See `docs/ai/audits_history.md` → "Judge Review — Tasks 5–8" and "Judge Review — Tasks 6, 8, 9, 10, 11".

  **Files touched:** `frontend/src/components/shared/SessionBar.js`, `frontend/src/lib/workspace.js`.

- [x] **Task 7 — Fix critical bug: repeated "Bake" clicks accumulate duplicate tracked alterations**

  **What was done:** Added `workspace.resetSession()` to `frontend/src/lib/workspace.js` — calls `POST /resetgv` with the existing `session_id` and the current `baseSequence` (unchanged), clearing all tracked alteration history and resetting `current_altered_sequence` to the base sequence. Modified `bake()` in `PipelineView.js` to check whether any enabled block is an alteration-category block (`Index-based`, `Pattern-based`, `Random`) before running the recipe; if so, it calls `workspace.resetSession()` first. Bakes containing only Scoring/Analysis blocks skip the reset — nothing to clear. The `ALTERATION_CATEGORIES` set is defined in the `PipelineView` component scope.

  **Judge verdict (2026-07-09): `[DONE]`.** Independently reproduced the exact scenario from the original bug report (Move block → Tracked Alterations block, 4 consecutive Bake clicks) — confirmed exactly 1 tracked entry after every click, not accumulating. Full suite shows no regressions (diffed against `git stash` baseline). See `docs/ai/audits_history.md` → "Judge Review — Tasks 5–8".

  **Correction (2026-07-10) — the above verification had a blind spot; the fix was NOT actually live.** `PipelineView.js` called `workspace.resetSession()` (a *named export* of `workspace.js`) but only ever imported `useWorkspace` — `workspace` itself was never imported. This threw a `ReferenceError` on every Bake, silently swallowed by the surrounding empty `catch {}` block (added to tolerate an unreachable session), so the reset never actually ran in the real app. The 2026-07-09 verification above reproduced the bug via direct API calls mirroring `bake()`'s *intended* logic, not by exercising the real frontend file — a gap inherent to this sandbox's lack of a browser/Node runtime, worth remembering for future sessions: a curl-level repro of "what the code is supposed to do" cannot catch a JS `ReferenceError` in code that was never actually executed. **Fixed** by importing `workspace` alongside `useWorkspace`. Re-verified live (see Task 7 in `docs/ai/audits_history.md` → "Judge Review — Tasks 12–20 batch" for the repro): 4 simulated Bake clicks now correctly produce exactly 1 tracked entry each time.

  **Files touched:** `frontend/src/views/pipeline/PipelineView.js`, `frontend/src/lib/workspace.js`.

### Frontend

- [x] **Task 8 — Highlight modified sequence regions in Pipeline output, with block-operation summary on hover**

  **What was done:** Added `parseTrackedLabel()` to `frontend/src/lib/sequence.js` — parses tracked-alteration human labels (e.g. `"insert:aaaa@12"`, `"move:3-6->@10"`) into `{ from, to, summary }` position ranges. `move`/`copy_paste` return the destination range (derived from `index_paste` and pattern length) instead of the stale source range; `replace`/`delete_by_pattern`/`mutate_independently` return `null` instead of fabricating `{from:0, to:0}`. Modified `SequenceTrack.js` to accept an optional `operations` Map (0-based position → operation summary string) and include it in the hover `title` when available. Modified `PipelineView.js`'s `bake()` to fetch `GET /get/allsimpleprobas` after a sequence-producing bake and build the operations Map from the tracked entries. Modified `OutputPanel.js` to pass the operations through to `SequenceOutput` → `SequenceTrack`; removed dead `buildOperationsMap()`.

  **Judge verdict (2026-07-09, re-attempt 2026-07-10): `[DONE]`.** Re-verified live: reset a session, ran a `move` (`start_cc=3,end_cc=6,index_paste=20`) against a periodic test sequence, and confirmed the backend's tracked label (`"move:3-6->@16"`) and the actual altered-sequence bytes at the computed destination range (`[15,18]` 0-based → `"cgat"`) match `parseTrackedLabel()`'s new math exactly. `replace`/`delete_by_pattern`/`mutate_independently` confirmed to return `null`. See `docs/ai/audits_history.md` → "Judge Review — Tasks 5–8" and "Judge Review — Tasks 6, 8, 9, 10, 11".

  **Files touched:** `frontend/src/lib/sequence.js`, `frontend/src/components/shared/SequenceTrack.js`, `frontend/src/views/pipeline/PipelineView.js`, `frontend/src/views/pipeline/OutputPanel.js`.

- [x] **Task 9 — Drag Index/Pattern blocks into the "Point Mutations → Delta Score" block, translated to standard mutations** — Implemented 2026-07-09: added `diffToPointMutations()` to `sequence.js`; `bake()` now stores `beforeSequence`/`resultData` on alteration blocks; `dragHandlers.onDragStart` tags drags with `application/x-recipe-block-uid`; `handleDropOnMutationList()` in `PipelineView.js` diffs before/after and appends `>p.<pos>.<ref>><alt>` strings; `MutationListField` accepts drops and shows errors; CSS drop-target highlight. Length-changing edits are rejected with a clear error.

  **Judge verdict (2026-07-10): `[DONE]`.** Verified `diffToPointMutations()` live: reset a session, ran an insert with an overwrite of matching length, and confirmed the manual position-diff of before/after matches the function's output exactly (including correctly skipping a position where the character happened not to change). Drop wiring reviewed: `MutationListField` correctly filters drops by the `application/x-recipe-block-uid` MIME type (ignoring Library-panel drags) and rejects non-Index/Pattern source categories with a clear error. **Found and fixed one regression shipped in the same commit, unrelated to Task 9's own logic:** `pipeline.css` line 1 read `op the .pipeline-view {` (stray typo) instead of `.pipeline-view {`, silently breaking the entire Pipeline view's top-level layout. Fixed directly. See `docs/ai/audits_history.md` → "Judge Review — Tasks 6, 8, 9, 10, 11".

  **Target confirmed:** Pipeline's `point_mutations_delta` block (`blockDefinitions.js`, label "Point Mutations → Delta Score") — its only field today is a manually-typed `rows` (`mutationList`). This is what "Mutation → delta score section" refers to.

  **Goal:** dragging an Index-based or Pattern-based block onto this block's form translates that structural operation into one or more `>p.<pos>.<ref>><alt>` strings appended to `rows`.

  **Hard constraint (flag, don't silently violate):** only same-length edits are representable in this project's point-mutation syntax — the backend's own `tuple_mutation()` (`app/domain/spliceai_calculation.py`) has this exact limitation, already relied on by `_track_alteration()`'s `mutation.splicing` labels. Insertions/deletions/moves/copy-pastes that change sequence length, or multi-base pattern replacements, cannot be exactly expressed this way. Reject with a clear inline message rather than silently emitting a wrong/partial translation.

  **Constraint on the drop mechanic:** structural alteration endpoints are **not** read-only (`architecture.md` → Frontend Layer note) — invoking one just to preview a diff would mutate the live session. Compute the translation from data that's already been captured (e.g. a block already baked once this session, using its tracked entry's before/after) rather than re-invoking the live endpoint purely for preview.

  **Files:** `frontend/src/views/pipeline/blockDefinitions.js`, `BlockForm.js` (new drop target on the `mutationList` field), `RecipeBlock.js`/`BlockLibrary.js` (drop source wiring, reusing the existing `application/x-block-id` dataTransfer plumbing), `frontend/src/lib/sequence.js` (diff→mutations helper).

- [x] **Task 10 — Chart peak click-to-popup (position, score, ±10 adjacent bases)**

  **Goal:** clicking a data point on any probability/delta chart opens a popup showing its exact position, its exact score, and the 10 bases to either side of that position from the relevant sequence. Make every point clickable (not just algorithmically-detected peaks) — simpler and more robust, and trivially includes the peaks the request calls out.

  **New component needed:** no popup/modal exists yet (`frontend/src/components/shared/Feedback.js` has banners/spinners/tiles/badges only) — add one, e.g. `frontend/src/components/shared/Popover.js`.

  **Wiring:** `frontend/src/components/shared/Chart.js` (the shared Chart.js wrapper) needs a click handler (Chart.js `options.onClick` / `getElementsAtEventForMode`) and a way for each call site to supply "the sequence this chart's x-axis refers to" (differs per call site — Pipeline's altered sequence, Compare's per-row `resultData`, Workbench's session sequence).

  **Implemented 2026-07-09:** Created `frontend/src/components/shared/Popover.js` — shows position, scores per dataset, and ±10 sequence context with the clicked base highlighted. Added `sequence` prop to `Chart.js`; when provided, enables a click handler via `chart.options.onClick` that uses `getElementsAtEventForMode` / `getDatasetMeta` to identify the clicked point, extracts its position from the label, collects all dataset scores at that index, and derives pixel coordinates for popover placement. Merges correctly with any pre-existing `options.onClick` (e.g. ManhattanChart's row focus). Wired all eligible call sites: `ProbaOutput`/`DeltaOutput` (pipeline, from `data["altered sequence"]`), `ProbaHistoryOutput` (pipeline, from each entry's own `["altered sequence"]`), `GenomeTrack` (workbench, from `ws.alteredSequence`), `DetailChart` (compare, from `row.resultData["altered sequence"]`). Added `.popover` CSS classes to `base.css`. ManhattanChart intentionally skipped — its click already focuses the row, and the detail view covers the popup purpose. Pending Judge review.

  **Files touched:** `frontend/src/components/shared/Popover.js` (new), `frontend/src/components/shared/Chart.js`, `frontend/src/views/pipeline/OutputPanel.js`, `frontend/src/views/dashboard/panels/GenomeTrack.js`, `frontend/src/views/comparative/DetailChart.js`, `frontend/src/styles/base.css`.

  **Coordinate with Task 13 and Task 18** — all three modify `Chart.js`. Task 10 adds the click handler; Tasks 13 (zoom) and 18 (region annotation) must each verify their plugin's event handling doesn't conflict with this click handler, and vice versa. Whichever lands last among the three must verify no regression.

  **Judge verdict (2026-07-10): `[DONE]`, after a bug found and fixed during review.** `Chart.js` computed the popup's `x`/`y` as viewport-relative coordinates (via `canvas.getBoundingClientRect()`), but `Popover.js` rendered with `position: absolute` inside `Chart.js`'s `position: relative` wrapper — CSS positions `absolute` elements relative to that ancestor, not the viewport, so the popup would appear double-offset from the actual click point (worse the further down/right the chart sits on the page). A dead, unused `containerRef` in `Chart.js` was a tell that this was an unfinished fix attempt. **Fixed** by changing the popover to `position: fixed` (matching the already-viewport-relative coordinate math and the existing `window.innerWidth/innerHeight` edge-clamps) and removing the unused ref. Independently traced all 5 wired call sites' label/sequence conventions (all 1-based, consistent) and confirmed both delta- and proba-mode backend responses populate `"altered sequence"`. See `docs/ai/audits_history.md` → "Judge Review — Tasks 6, 8, 9, 10, 11" for full detail. Sandbox caveat applies (no browser/Node in this environment) — recommend a human click-test before release.

- [x] **Task 11 — Verify double-click text selection in input fields**

  Lightweight verification task, likely a no-op: scanned the CSS during planning and found no `user-select: none` scoped broadly enough to affect `<input>`/`<select>` elements (only `.sequence-track__gutter` and `.data-table th`, both correctly non-selectable UI chrome) and no custom `onMouseDown`/`onSelectStart` handlers on input fields. Manually verify double-click-selects-word across `TextField`/`IntField`/`SelectField` (`BlockForm.js`), the mono sequence textareas, and matrix/position inputs. Only make a code change if an actual regression is found; if so, document exactly what was blocking it. Same no-browser sandbox caveat as prior frontend tasks applies — flag it rather than skip verification silently.

  **Verified 2026-07-09:** Confirmed via static analysis:
  - Only `user-select: none` declarations are on `.sequence-track__gutter` and `.data-table th` — both non-selectable UI chrome, neither affects `<input>`/`<select>`/`<textarea>`
  - Zero custom `onMouseDown`/`onSelectStart`/`onMouseUp` handlers exist anywhere in the frontend JS
  - All input types (`TextField`, `IntField`, `SelectField`, `MutationListField` position inputs and base selects, `Matrix4x4Field` number inputs, `SessionBar` textarea) are unblocked
  - **No regression found — no code change needed.**
  - *Caveat:* verified via static source analysis only (no browser available in this environment). A human should spot-check in a live browser before the next release.

  **Judge verdict (2026-07-10): `[DONE]`.** Re-confirmed the static analysis against the current tree — still holds, no code change needed.

- [x] **Task 12 — Blue-violet gap-indicator bar when dragging a block between two others**

  Reordering itself already works (`reorder()` in `PipelineView.js`, wired via native HTML5 drag-and-drop in `RecipeBlock.js`) — this is purely a visual-affordance gap. Currently a drag-over target gets a whole-block outline (`.recipe-block--drop-target`'s box-shadow, using `--app-accent: #6366f1` — this is "the blue-violet CSS color already present in the frontend" the request refers to). Add a thin bar rendered in the gap between two blocks during drag-over, using the same `--app-accent` color, as a more precise "insert here" indicator — replacing or supplementing the current whole-block highlight.

  **Implemented 2026-07-10:** the existing `overIndex` state already means "insert before this index" (per `reorder()`'s splice math), so no drag-logic changes were needed — `PipelineView.js`'s recipe map now interleaves a `.recipe-gap` div before each block (`recipe.flatMap` instead of `recipe.map`), lighting up (`--app-accent`, 4px bar) when `overIndex === index`. Supplements the existing whole-block highlight rather than replacing it.

  **Judge verdict (2026-07-10): `[DONE]`.** Reviewed the flatMap restructure — each gap/block pair keyed uniquely (`gap-${uid}`/`uid`), no key collisions; the mechanism reuses existing state with no new drag handlers, so no new failure surface. Sandbox caveat (no browser) applies — visually unverified.

  **Files:** `frontend/src/views/pipeline/PipelineView.js`, `pipeline.css`.

- [x] **Task 13 — Chart zoom: +/- buttons + slider, and magnifying-glass drag-select + home reset**

  **Scope:** every chart rendered by a Scoring-category block's output — Pipeline's `ProbaOutput`/`ProbaHistoryOutput`/`DeltaOutput` (`OutputPanel.js`), Compare's `DetailChart`/`ManhattanChart`, Workbench's equivalent chart usage. Enumerate exact call sites during implementation (`DeltaSummary.js` currently renders stat tiles only, no chart — confirm whether it's in scope).

  **New dependency:** no zoom/pan plugin is currently loaded (`Chart.js` today only imports `chart.js@4.4.4/auto` from `esm.sh`). Add `chartjs-plugin-zoom` (e.g. `https://esm.sh/chartjs-plugin-zoom@2`), register once.

  **Two requested UX mechanisms, one underlying zoom/pan state:** (1) an x-axis zoom toolbar (`+`/`-` buttons, a scroll/pan slider) and (2) the plugin's native drag-to-select-region zoom plus a "home" button calling the plugin's `resetZoom()`. Implement both against the same plugin state rather than two separate zoom systems.

  **Coordinate with Task 10 and Task 18** — the zoom plugin's own drag/click handling could conflict with Task 10's click-to-popup handler; whichever of these three lands last must verify no regression against the earlier two.

  **Implemented 2026-07-10 (landed last of the Chart.js-touching trio):** added `chartjs-plugin-zoom@2` (pinned to `chart.js@4.4.4` via esm.sh's `?deps=` param to avoid a duplicate Chart.js copy), registered once at module scope in `Chart.js`. Registered `plugins.zoom` with wheel/pinch/drag-select zoom and x-axis pan, merged into `mergedOptions.plugins` (preserves any caller-supplied `plugins`, e.g. `ManhattanChart`'s `legend: {display:false}`). Added a toolbar (`-`/slider/`+`/⌂ home) above every chart, calling `chart.zoom()`/`chart.pan()`/`chart.resetZoom()` directly on the existing `chartRef`. The pan slider is a relative scrubber (re-centers to 50 after each input) rather than an absolute position, since Chart.js doesn't expose "current pan position" as a simple 0-100 value. Since this is added centrally in the shared `Chart` component, every consumer (including `ManhattanChart`/`DetailChart`/`GenomeTrack`) gets it automatically — matches "every chart" scope without touching each call site.

  **Judge verdict (2026-07-10): `[DONE]`.** Verified the `chartjs-plugin-zoom@2` esm.sh URL resolves (HTTP 200, real ESM module, correct default export) — confirmed via live `curl` in this sandbox. Reviewed the plugins-merge to confirm `ManhattanChart`'s existing `legend` option survives. Static analysis only for the actual zoom/pan/drag-select *interaction* — no browser available in this sandbox to click-test it; flagging for a human check same as Tasks 9/10.

  **Superseded (2026-07-14, Pipeline view UX overhaul):** the human click-test flagged above surfaced that plain-wheel zoom fought normal page scrolling and the pan slider was hard to use. Redesigned: wheel-zoom now requires **Ctrl** (plain wheel scrolls the page), drag-to-select zoom and the pan slider were removed in favor of a static "Ctrl + scroll to zoom" hint plus click-drag panning, and the `+`/`-`/reset buttons were kept. See `docs/ai/architecture.md` §9.2 (`Chart.js`) for the current behavior.

  **Further superseded (2026-07-15, plan5):** the "Ctrl + scroll to zoom" static hint text was removed from the toolbar (the `+`/`-`/reset buttons are now right-aligned in its place); the actual Ctrl-required wheel-zoom behavior is unchanged.

  **Files:** `frontend/src/components/shared/Chart.js`, `frontend/src/lib/chartLogic.js`, `frontend/src/styles/base.css`.

- [x] **Task 14 — "Tracked Alterations" block: expandable per-entry summary**

  **Precise target:** the `tracked_alterations_simple` block's result-summary line rendered under its form in `RecipeBlock.js` (e.g. "→ 2 tracked alteration(s)", produced by `PipelineView.js`'s `summarize()`) — not the Output panel (which already shows one chart per entry). Make this line clickable/expandable to list each tracked entry's label — the same `"{step index}: {mutation.human}"` strings already used as chart labels in `ProbaHistoryOutput`.

  **Requires:** `PipelineView.js`'s `recipe` state currently stores only `resultSummary` (a string) per block; add the raw result data too (at least for this block type) so it can be expanded without re-fetching.

  **Implemented 2026-07-10:** `bake()` already stores `resultData` on every block (added by Task 9's diff-capture work) — no `PipelineView.js` change was actually needed. `RecipeBlock.js` now renders the `tracked_alterations_simple` block's (`outputKind === "probaHistory"`) result summary as a clickable toggle button; expanding lists `Object.keys(block.resultData)` (the same labels `ProbaHistoryOutput` uses).

  **Judge verdict (2026-07-10): `[DONE]`.** Confirmed `resultData` is populated for every non-sequence block type (Task 9's `bake()` branch), so no re-fetch is needed on expand. Sandbox caveat applies.

  **Files:** `frontend/src/views/pipeline/RecipeBlock.js`, `pipeline.css`.

- [x] **Task 15 — Distinct colors for "Scoring" and "Analysis" block categories**

  `blockDefinitions.js` already tags every block with a `category` (`Index-based`, `Pattern-based`, `Random`, `Scoring`, `Analysis`); `.recipe-block__category` (`pipeline.css`) renders all of them identically today (neutral gray). Add distinct accent colors specifically for `Scoring` and `Analysis` — the two categories that score/analyze rather than modify the sequence — via a category→CSS-class mapping. Optionally apply the same mapping to `.block-library__item` in the Library panel for consistency.

  **Implemented 2026-07-10:** added `categorySlug()` to `blockDefinitions.js` (maps `Scoring`/`Analysis` to a slug, others to `""`), two new CSS vars (`--category-scoring: #eab308`, `--category-analysis: #06b6d4`) in `base.css`, and modifier classes in `pipeline.css`. Applied to both `.recipe-block__category` (`RecipeBlock.js`) and `.block-library__item` (`BlockLibrary.js`, as a left border accent) per the "optionally" note.

  **Judge verdict (2026-07-10): `[DONE]`.** Colors chosen distinct from existing base-pair colors (`--base-a/c/g/t`) and from `--app-accent`/`--success`/`--danger` to avoid visual collision.

  **Files:** `frontend/src/views/pipeline/blockDefinitions.js`, `RecipeBlock.js`, `BlockLibrary.js`, `pipeline.css`, `frontend/src/styles/base.css`.

- [x] **Task 16 — "Random Mutation" block: matrix row-sum validation (pale red)**

  `BlockForm.js`'s `Matrix4x4Field` already labels itself "(row = original base, column = mutated base)" — each **row** is a probability distribution over destination bases for a fixed original base, so rows (not columns) are what must sum to 1. Highlight a row pale-red when `|Σrow − 1| > 0.001` (small epsilon to avoid float-rounding false positives on entries like `0.33333`).

  **Implemented 2026-07-10:** `Matrix4x4Field` now computes each row's sum and applies `.matrix-field__row--invalid` (pale-red `<td>` background) when `|sum - 1| > 0.001`, exactly the epsilon specified.

  **Judge verdict (2026-07-10): `[DONE]`.**

  **Files:** `frontend/src/views/pipeline/BlockForm.js` (`Matrix4x4Field`), `pipeline.css`.

- [x] **Task 19 — Upload a FASTA (`.txt`) file to load the base sequence**

  Add a file-upload control to `SessionBar.js` alongside the existing textarea. Parsing rules for the header/body split the user's example demonstrates:
  - Header line starts with `>` — everything after it is the sequence's display name. `workspace.initSession(sequence, name)` already accepts a `name` param; wire the parsed header text into it (no backend change needed).
  - All following lines are sequence lines: strip leading/trailing whitespace per line and concatenate — line breaks are formatting only (FASTA convention wraps at a fixed width), never meaningful. Handle a single-record file; a file containing multiple `>` headers should be rejected with a clear error rather than silently using only the first record or concatenating records together.
  - Normalize case using the existing `cleanSequence()`/`isValidSequence()` in `frontend/src/lib/sequence.js` — reuse, don't reimplement.

  **Flag, don't silently resolve:** the user's own example sequence is all `N` (unknown base), but `isValidSequence()` today only accepts strict ACGT (`workspace.js`: `"Sequence must contain only A, C, G, T characters."`). A literal `N`-only FASTA would be parsed correctly by this task and then rejected by existing validation — that's expected/acceptable for this task's scope (surface the existing validation error, don't change what sequences are valid), but call it out explicitly since it means the user's own sample file wouldn't load end-to-end without a separate, NOT-yet-planned task to support ambiguity codes.

  **Implemented 2026-07-10:** `parseFasta()` added to `sequence.js` — skips blank lines and legacy `;` comment lines, captures the first `>` header as the name, rejects files with >1 header, concatenates and reuses `cleanSequence()` on the body. `SessionBar.js` got a hidden `<input type="file">` triggered by an "Upload FASTA…" button; on parse success it fills the existing textarea `draft` and a new `draftName` state (passed to both `loadSequenceIntoSession`/`initSession`, which already accepted a `name` param — no backend change needed, as anticipated). Parse errors surface via a dedicated `ErrorBanner`, separate from `ws.lastError`.

  **Judge verdict (2026-07-10): `[DONE]`.** Independently re-verified `parseFasta()` against the user's exact example (`>1 dna:chromosome chromosome:GRCh38:1:1:50:1` + 50×`N`) by mirroring the identical line-by-line logic in Python — correctly extracts the full header as the name and the 50-base sequence. Confirmed the flagged N-only caveat holds (would be correctly rejected downstream by existing `isValidSequence()`, not silently accepted) — this is the intended scope boundary, not a bug.

  **Files:** `frontend/src/components/shared/SessionBar.js`, `frontend/src/lib/sequence.js` (new `parseFasta()`).

### Backend + Frontend (large — architecturally significant)

- [x] **Task 17 — Pattern-based operations track one variant per match occurrence** (backend)

  **Current behavior confirmed:** `AlterationFunctionsByPattern.replace()` / `.delete_by_pattern()` (`app/domain/sequence_functions.py`) use `re.sub()` — a single pass that rewrites **every** match at once, tracked as **one** `_track_alteration()` entry. Requested: if a pattern has N matches (e.g. `"aaa"→"ccc"` matching twice), produce N separately tracked variants, each reflecting only *one* match changed with the others left as in the pre-operation sequence.

  **Explicit design decision — confirm before/while implementing, don't silently guess wrong:** to preserve the existing single-linear-`altered_sequence`-chain architecture (every other alteration function, and the whole session model, assumes exactly one "current" altered sequence that later operations chain onto), what feeds forward into `self.altered_sequence` for subsequent chained blocks remains the current all-matches-replaced result. The N per-match variants are **additional** entries recorded purely for tracking/scoring visibility (feeding Task 18's charts) — they do not become the new working sequence. If the actual intent is that the pipeline should branch into N parallel working sequences, that's a materially larger change (multi-branch session state, not scoped here) — stop and raise it rather than build it under this task.

  **Mechanics:** enumerate all non-overlapping matches via `re.finditer()` on the existing `_pattern_to_regex()` output; for each match, build the single-match-only variant sequence, compute its `proba_simple` (same as every other tracked entry), and store it via `_track_alteration()`-equivalent with a disambiguated label (e.g. `f"replace:{old}->{new}[match {i}/{n}]@{match_start}"`) plus the match's position range (`match_start`, `match_end`) stored directly on the entry, so Task 18 doesn't need to re-parse it from the label.

  **Tests:** extend `app/test/test_mixins.py` / `test_alteration_functions.py` with multi-match cases for both `replace` and `delete_by_pattern`.

  **Implemented 2026-07-10:** `_track_alteration()` (`mixins.py`) gained optional `match_start`/`match_end` kwargs (0-based, inclusive), stored on the entry only when set. `replace()`/`delete_by_pattern()` (`sequence_functions.py`) now enumerate `re.finditer()` matches against the pre-operation sequence via a shared `_track_pattern_match_variants()` helper: for each match (only when there are ≥2 — a single match is already fully represented by the main entry), builds the single-match-only variant, temporarily swaps `self.altered_sequence` to it, calls `_track_alteration()` with a disambiguated label (`"replace:aaa->ttt[match 1/2]@4"`) and the match range, then restores it. `self.altered_sequence` (the forward-chaining value) is unaffected — exactly the documented design decision.

  **Bug found and fixed during implementation (not part of the original ask, but load-bearing):** each variant's `_track_alteration()` call persists `current_altered_sequence` to Redis (used by every subsequent request to reconstruct the session's `InternalGeneticVariant`) — since `self.altered_sequence` is temporarily swapped to the variant's one-off sequence during that call, the *last* variant tracked would otherwise leave Redis pointing at a throwaway branch instead of the real chain result, silently corrupting every operation chained after a multi-match pattern op. Fixed with a new `_resync_current_altered_sequence()` on the mixin, called once after the variant loop finishes. Caught via live reproduction (chained a `delete` after a 2-match `replace` and found the working sequence corrupted), not by the unit tests alone — added a dedicated regression test for the exact invariant (`test_replace_variants_do_not_corrupt_persisted_current_altered_sequence`).

  **Judge verdict (2026-07-10): `[DONE]`, independently re-verified live.** Reproduced against the real backend (not just the unit-test stub): `replace(old="aaa", new="ttt")` on `"cccaaacccaaaccc"` (2 matches) produced exactly 3 entries — the all-matches-replaced main entry plus 2 variants, each showing only its own match changed (`ccctttcccaaaccc` / `cccaaaccctttccc`) — and confirmed chaining a subsequent `delete` afterward used the correct working sequence, not a variant. `pytest app/test/test_mixins.py` — 24/24 pass (18 baseline + 6 new: 2 replace-variant tests, 1 single-match-no-duplicate test, 2 delete-by-pattern-variant tests, 1 Redis-persistence regression test). Full suite: 43 pre-existing failures unchanged, 4 new passes.

  **Files:** `app/domain/sequence_functions.py`, `app/domain/mixins.py`, `app/test/test_mixins.py`.

- [x] **Task 18 — Highlight pattern-match regions pale-red on Tracked Alteration output charts** (blocked on Task 17)

  On every Tracked Alteration output chart (Pipeline's `ProbaHistoryOutput`, Workbench's `TrackedProbabilities` in `HistoryLog.js`, Compare's proba-mode charts in `DetailChart.js`), shade the x-axis position range of each pattern-based variant's specific match, in pale red, using the match-range data Task 17 now stores per entry.

  **New dependency:** background-region shading on a Chart.js chart typically needs a plugin (e.g. `chartjs-plugin-annotation`) or a custom draw hook — distinct from Task 13's zoom plugin; verify the two plugins coexist on the same `ChartJS` instance without conflict.

  **Coordinate with Task 10 and Task 13** — all three modify `Chart.js`; land last among the three, verify against the earlier two.

  **Implemented 2026-07-10 (no new plugin needed):** rather than a separate annotation plugin, unified this with Task 20's zone-marking mechanism (also a per-bar colored border, landing at the same time) — `trackedEntryZone(label, entry)` (`sequence.js`) picks `entry.match_start`/`match_end` (Task 17, when present — a specific pattern match) over the generic `parseTrackedLabel()` range, and `TrackedAlterationEntry` (`OutputPanel.js`) colors the border pale-red for a pattern-match entry vs. pale-green otherwise (label text colored to match). This sidesteps the original "two overlapping borders on the same bars" coordination concern noted in Task 20's plan: a pattern match *is* the entry's whole affected zone for that variant, so there's one border, correctly colored per entry type, not two. `DetailChart.js`'s proba-mode rows get this for free by reusing `TrackedAlterationEntry`.

  **Judge verdict (2026-07-10): `[DONE]`, independently re-verified live.** Reproduced a 2-match `replace` against the real backend and confirmed via `/get/allsimpleprobas` that the main entry has no `match_start`/`match_end` (falls back to the generic zone, correctly `null` for `replace:` per Task 8, so no border) while both variant entries carry the correct 0-based match ranges (`[3,5]` and `[9,11]`) that `trackedEntryZone()` picks up as pattern matches. No new Chart.js plugin was added, so no plugin-conflict surface with Task 13's `chartjs-plugin-zoom` exists for this task. Full backend suite re-run — no regressions (this task was frontend-only; the backend data it consumes was already verified under Task 17/20).

  **Files:** `frontend/src/lib/sequence.js` (`trackedEntryZone()`), `frontend/src/views/pipeline/OutputPanel.js`, `frontend/src/views/dashboard/panels/HistoryLog.js`, `frontend/src/styles/base.css`, `frontend/src/views/dashboard/dashboard.css`. `DetailChart.js` required no direct change (inherits via `TrackedAlterationEntry` reuse).

- [x] **Task 20 — Tracked Alteration output: delta-vs-base bar charts, split donor/acceptor, pale-green zone labeling** (backend + frontend, planned 2026-07-10)

  **Goal:** replace the Tracked Alteration block's current output (one line chart per tracked entry showing *absolute* baseline probability) with **delta-vs-base-sequence bar charts**: for each tracked entry, per position, `delta = altered_proba[i] - base_proba[i]`. Bars render as the delta height; a positive delta's *added* portion is green, a negative delta's *removed* portion is red (mirrors `/GetDeltaScore/`'s existing sign convention, just visualized as a bar instead of a signed line). **Split into two charts per tracked entry** — one for acceptor, one for donor — replacing today's single combined chart.

  **Scope decision (confirmed with user 2026-07-10) — same-length entries only:** a per-position diff against the base sequence is only well-defined when the tracked entry's altered sequence is the same length as the base (point/matrix mutations, and any index/pattern op whose net effect doesn't change length). For length-changing entries (insert/delete/move/copy-paste-with-different-`length_paste`, `delete_by_pattern`, non-equal-length `replace`), **keep the existing absolute-probability chart** for that entry instead, with a short inline note (e.g. "Delta view not available — this operation changes sequence length") so the user isn't shown a silently-wrong or truncated diff. Do not attempt prefix-alignment or index-truncation workarounds.

  **Backend:** `_track_alteration()` (`app/domain/mixins.py`) already stores `altered_sequence` per entry and the base sequence is in `base_sequence`. Add a per-entry delta computation reusing `GeneralServices.return_proba_delta()`'s existing math (`app/services/general_services.py:105-138` — same sign convention, same `delta_proportion_variation` shape) when `len(altered_sequence) == len(base_sequence)`; store the result (or a flag indicating "not applicable") on the entry so `GET /get/allsimpleprobas` can surface it without every consumer recomputing it. Decide during implementation whether to compute eagerly (at track-time, cost paid once) or lazily (only when `/get/allsimpleprobas` is called, cost paid per read) — eager is likely simpler given `_track_alteration()` already runs one model call per entry.

  **Frontend:** `frontend/src/views/pipeline/OutputPanel.js`'s `ProbaHistoryOutput` (and the same-shaped consumers in Workbench's `HistoryLog.js` `TrackedProbabilities` and Compare's proba-mode `DetailChart.js`) render two `Chart` instances (`type: "bar"`) per entry instead of one `line` chart, coloring each bar green (increase) or red (decrease) per Chart.js's per-point `backgroundColor` array support. Reuse Task 8's `parseTrackedLabel()` `{from, to}` range (already computed for the hover-highlight feature) to render the entry's own label string in pale green and mark the same `[from, to]` zone (start/end index) on the chart itself in pale green — this is a *different* range/color purpose from Task 18's pale-red pattern-match shading (Task 18 highlights a specific sub-match *within* a pattern-based variant; this pale-green marks the *entry's own* overall affected zone, for any operation type with a determinable range). **Coordinate note:** for a same-length pattern-based variant (Task 17) with exactly one match, Task 18's red range and this task's green range may coincide exactly — acceptable (they're layered, not exclusive), but land whichever of Task 18/20 is second and verify the combination isn't visually confusing (e.g. use `border` for one and `background` for the other rather than two overlapping fills).

  **Coordinate with Task 13 and Task 18** — all three touch the same Tracked-Alteration chart call sites (`OutputPanel.js`, `HistoryLog.js`, `DetailChart.js`) and/or `Chart.js` itself; whichever lands last verifies no regression against the earlier two.

  **Implemented 2026-07-10:** Extracted `compute_delta_result()` from `GeneralServices.return_proba_delta()` into a standalone pure function (`general_services.py`) — same math, but callable without triggering `return_proba_delta()`'s own `apply_mutations()` side effect (which would have mutated `self.sequence`/`self.altered_sequence` based on `self.mutations`, an unrelated and unsafe side channel to trigger from inside alteration tracking). `_track_alteration()` now computes `delta_proba` via this helper whenever `len(self.sequence) == len(altered_seq)`, reusing the already-computed `proba` (altered) and one additional `result_per_sequences(using_altered_sequence=False)` call (base) — stored on the entry only when computed. `GET /get/allsimpleprobas` passes `delta_proba`/`match_start`/`match_end` through when present. Frontend: new `TrackedAlterationEntry` component (`OutputPanel.js`, exported for reuse) renders two `type:"bar"` charts (acceptor/donor) with `deltaBarColors()` (green/red per-bar fill by sign) and `zoneBorderStyle()` (colored per-bar border marking the entry's `[from,to]` zone, via new plain per-index array styling — no new annotation plugin needed). Falls back to the pre-existing line chart + note for length-changing entries. Wired into Pipeline's `ProbaHistoryOutput`, Compare's `DetailChart.js` (`row.kind === "proba"` branch — reuses the exact same component so the two stay in sync), and Workbench's `HistoryLog.js` (kept its existing compact peak-summary format rather than adding full charts there, but switched its data source to delta and added the same pale zone-label styling — a deliberate proportionality choice, flagged for the user to reconsider if full charts are wanted there too).

  **Judge verdict (2026-07-10): `[DONE]`, independently re-verified live.** Confirmed `return_proba_delta()`'s refactor is behavior-preserving via a live `/GetDeltaScore/` call (identical response shape/values to before). Confirmed `delta_proba` appears end-to-end via `/get/allsimpleprobas` for a same-length tracked alteration (`insert` with matching overwrite length) and is absent for a length-changing one (verified both via live backend calls and dedicated `test_mixins.py` tests). Cross-checked the zone math: for `"insert:gggg@5"`, `parseTrackedLabel()`'s `[4,7]` (0-based) range lines up exactly with the real `delta_proba` positions showing a change. `pytest app/test/test_mixins.py` — all pass (2 new delta-specific tests on top of Task 17's). Sandbox caveat (no browser) applies to the actual chart rendering/coloring, verified only by data-shape tracing.

  **Files:** `app/domain/mixins.py`, `app/services/general_services.py`, `app/router/get_router.py`, `frontend/src/views/pipeline/OutputPanel.js`, `frontend/src/views/dashboard/panels/HistoryLog.js`, `frontend/src/views/dashboard/dashboard.css`, `frontend/src/views/comparative/DetailChart.js`, `frontend/src/lib/sequence.js` (`deltaBarColors()`, `zoneBorderStyle()`, `trackedEntryZone()`), `frontend/src/styles/base.css`, tests in `app/test/test_mixins.py`.

  **Superseded (2026-07-15, plan5), `OutputPanel.js`/`DetailChart.js` only:** `zoneBorderStyle()`'s `color` param was dropped — the zone border is now always white (a thicker 2px border), no longer pale-red for a pattern match vs. pale-green otherwise. `TrackedAlterationEntry` (`OutputPanel.js`) replaced the colored label + "(match N-M)"/"(positions N-M)" suffix with `parseTrackedAlterationDisplay()`'s `**{step}** : **{operation type}** : [{from} - {to}]` syntax and, when a zone range exists, a plain "tracked mutation" caption underneath instead of color-coding the label text. `DetailChart.js` inherits this via its `TrackedAlterationEntry` reuse. `HistoryLog.js`'s own compact peak-summary rendering is untouched — it reads `trackedEntryZone()`'s `isPatternMatch` directly (not through `zoneBorderStyle()`) and still pale-color-codes its own zone label independently.

---

## Reference: Feature Catalog & Historical Fix Log


## Core API Endpoints
- [x] **`POST /GetSimpleProb/`** — Returns baseline acceptor and donor splicing probabilities for a DNA sequence with optional point mutations.
- [x] **`POST /GetDeltaScore/`** — Returns the delta (difference) in splicing scores between original and mutated sequences.
- [x] **`POST /resetgv`** — Starts/resets a session-bound internal genetic variant with a new sequence/mutations (session-based, not singleton — see `docs/ai/architecture.md` → "Session Management").
- [x] **`GET /get/sequence|gv|simpleproba|deltaproba|mutations|alteredsequence`** — Read accessors for a session's variant state (`session_id` query param).
- [x] **`GET /get/allsimpleprobas`** — Baseline probability per tracked altered-sequence version, keyed by `"{step index}: {mutation.human}"`. **Bug fixed (2026-07-09):** the per-entry `"altered sequence"` field was silently wrong for bounded deletes and non-default-length insert/move/copy-paste. Fixed by storing `altered_sequence` directly per entry in `_track_alteration()` (option b from the audit). `_apply_single_alteration()` now returns the stored string immediately when present, falling back to label-based reconstruction for backward compatibility. `test_mixins.py` extended with 5 new tests (bounded delete, non-default-length insert/move/copy-paste, backward compatibility). **All 18 tests pass.**

### Sequence Alteration (Index-based)
- [x] **`POST /altbyindex/delet`** — Delete bases by start/end index or length.
- [x] **`POST /altbyindex/insert`** — Insert a pattern at a given index.
- [x] **`POST /altbyindex/move`** — Cut-and-paste a subsequence to a new position.
- [x] **`POST /altbyindex/copypast`** — Copy-and-paste a subsequence to a new position.

### Sequence Alteration (Pattern-based)
- [x] **`POST /altbypattern/replace`** — Replace a pattern with wildcard support (`_` for one base, `%(n)` for up to n bases).
- [x] **`POST /altbypattern/delet`** — Delete a pattern with wildcard support.

### Random Mutation
- [x] **`POST /mutateindependently`** — Mutate each base independently according to a 4×4 probability matrix.

### Genomic Analysis
- [x] **`POST /analysis/patterninzona`** — Zone detection using PELT change-point algorithm + windowed mutant enumeration to find impactful mutation patterns.

### SpliceAI Integration
- [x] Loading and ensembling of 5 SpliceAI models (via `spliceai` package and TensorFlow/Keras).
- [x] One-hot encoding with context padding (N-flanking, default 10,000 bases).
- [x] `SpliceAIModels` class with native `tf.keras.Model` support for gradient tracking.
- [x] `tuple_mutation()` utility to derive SpliceAI mutation labels from sequence diffs.

### Session Management  ✅
- [x] Redis-backed session storage (connection configurable via `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB` env vars). **Changed (2026-07-15, plan5):** `set_session_data()`'s `ttl` param now defaults to `None` (no expiry) instead of 1800s/30 minutes — no call site passes an explicit `ttl`, so session data no longer expires on its own.
- [x] `create_internal_variant()` factory for session-aware variant creation.
- [x] `AlteredSequenceTrackerMixin` for persisting alteration history (proba, mutation labels).
- [x] Compact Redis storage: one-hot arrays no longer persisted in `session:{id}:altered_sequences` entries (previously stored ~20,000+ × 4 floats per alteration call). One-hot encoding is now computed transiently, in memory, only during model calls.
- [x] `reconstruct_altered_sequence()` helper that replays tracked alteration history from Redis to deterministically rebuild the current altered sequence.
- [x] `test_mixins.py` — 13 unit tests covering reconstruction for all 7 alteration types, chained operations, random-mutation fallback, and verification that `one_hot` is not persisted.

### Scoring
- [x] Vector norm scoring: Euclidean, Manhattan, Weighted (pondered), Quadratic.
- [x] Delta score computation per-position for acceptor and donor probabilities.

### Validation & Error Handling
- [x] Mutation syntax validation (`>p.<pos>.<ref>><alt>` format).
- [x] DNA sequence validation (ATCG characters only).
- [x] Custom exceptions: `InvalidMutationSyntax`, `NotItalisedInternalGeneticVariant`, `CurrentBaseToMutateDoesntMach`.
- [x] Warnings for double-mutation of same base and base mismatch.

### Tests
- [x] `test_independent_gv.py` — Unit test for `IndependentGeneticVariant`.
- [x] `test_analysis_regression.py` — Regression tests for `_zona()` and `pattern_in_zona()` with monkeypatching.
- [x] `test_functions.py` — Script-based testing with visualization utilities (integrated gradients plotting, JSON output).

---

## Bug Fixes Completed (2026-07-07)
- [x] **`AlterationFunctionsByIndex` mixin inheritance**: Added `AlteredSequenceTrackerMixin` to `AlterationFunctionsByIndex` (previously missing).
- [x] **`AlterationFunctionsByPattern` mixin inheritance**: Already inherits from `AlteredSequenceTrackerMixin`.
- [x] **`result_per_seqences` typo**: Fixed → `result_per_sequences` in `GeneralServices` and `IndependentGeneralServices` (both method name and parameter name `using_altered_seqence` → `using_altered_sequence`).
- [x] **`return_proba_simple` bug**: `IndependentGeneralServices.return_proba_simple()` used `altered = self.apply_mutations()` which returns `None`; now uses `self.sequence` after mutation (same as `GeneralServices`).
- [x] **`euclidian` typo**: Fixed → `euclidean` in `Scoring` and `IndependentScoring` (both in `calcul_function.py`).
- [x] **`initialize_internal_gv.py` stub**: Recreated the missing module for legacy singleton imports.
- [x] **Migrate 4 legacy routers** to session-based factory:
  - `get_router.py` — Now uses `create_internal_variant()` with `session_id` query parameter
  - `resetgv_router.py` — Now uses `create_internal_variant()` with `session_id` parameter
  - `analysis_router.py` — Now uses `create_internal_variant()` with `session_id` parameter
  - `alteration_radom.py` — Now uses `create_internal_variant()` with `session_id` parameter

## TODO / Known Issues

### 🔴 High Priority
- [x] **`AlterationFunctionsByIndex` still uses `self.sequence` instead of `self.altered_sequence` in `move()` and `copy_past()` methods**: The `pattern` is extracted from `self.sequence` rather than the current `self.altered_sequence`, which means subsequent alterations don't chain correctly.

### 🟡 Typos & Bugs (Plan §5) ✅
- [x] **Endpoint typo `/delet`**: Both `/delete` and `/delet` aliases registered in routers.
- [x] **`length_past` param name**: Renamed to `length_paste` in MoveParameters and CopyPasteParameters schemas.
- [x] **`get_router.py` endpoint typo `/delatproba`**: Both `/deltaproba` and `/delatproba` aliases registered.

### 🟠 Architectural / Code Quality
- [x] **Code duplication between `GeneralServices` and `IndependentGeneralServices`**: Eliminated — child only overrides `_mutations_target_attr`.
- [x] **Code duplication between `Scoring` and `IndependentScoring`**: Eliminated via `IndependentScoring = Scoring` alias.
- [ ] **Refactor `InternalGeneticVariant` mega-class**: 9-parent multiple inheritance. Consider composition.
- [ ] **Fix spelling inconsistency**: `independant_gv_schema.py` uses French spelling.

### Testing ✅
- [x] Add unit tests for `AlterationFunctionsByIndex` (insert, delete, move, copy_paste) — `test_alteration_functions.py`.
- [x] Add unit tests for `AlterationFunctionsByPattern` (replace, delete with wildcards) — `test_alteration_functions.py`.
- [x] Add tests for Redis session management — `test_redis_session.py`.
- [x] Add integration tests for the FastAPI endpoints — `test_endpoint_integration.py`.

### Documentation ✅
- [x] Write proper `README.md` with setup instructions, API usage, Redis configuration.

---

## Code Review & Audit Fixes (2026-07-07)

### 🔴 Critical Bugs Fixed
- [x] **`alteration_byindex_router.py` logic bug**: `end`/`length` conditions were swapped — passing `end=None` as `end` parameter and `length=p.end` (wrong variable). Fixed to correctly route `end` and `length` parameters.
- [x] **`test_endpoint_integration.py` broken Redis monkeypatch**: Referenced non-existent `_get_client` instead of `_get_redis_client`. Fixed to use correct function name.
- [x] **`test_endpoint_integration.py` `_FakeModel` missing `_one_hot_encoder`**: Any alteration endpoint test that triggers `_track_alteration` would crash because the stub lacked the `_one_hot_encoder` method. Added stub method.
- [x] **`main.py` missing `alteration_radom` router**: The `/mutateindependently` endpoint was never registered in the FastAPI app. Added router inclusion.
- [x] **`test_alteration_functions.py` missing `test_` prefix**: `delete_end_to_end` method was not discovered by pytest. Renamed to `test_delete_end_to_end`.
- [x] **`sequence_functions.py` `mutate_independently` missing tracking**: Did not call `_track_alteration`, inconsistent with all other alteration methods. Added tracking call.
- [x] **`general_services.py` `return_proba_delta` IndexError**: Iterated `len(self.sequence)` but indexed `self.altered_sequence[i]` — crashes when altered sequence is shorter (after deletions). Fixed to iterate `len(self.altered_sequence)`.

### Potential Features
- [ ] Expose Acceptor Loss and Donor Loss SpliceAI scores.
- [ ] Add batching support for multiple sequences in a single request.
- [x] Add a web frontend — three MVP proposals added under `frontend/` (no-build-step Preact/htm/Chart.js), see `frontend/README.md`.
- [ ] Dockerize the application.
- [ ] Add `/health` endpoint.

---

## `fastapi run app/main.py` Startup & Runtime Fixes (2026-07-07)

Prior to this pass, the app could not start at all under `fastapi run`, and
most endpoints that reached the SpliceAI model or Redis-tracked alterations
crashed. Root-caused and fixed one bug at a time, verifying with
`python test_payloads.py --server http://127.0.0.1:8000` after each fix
until all 11 endpoints (plus all 6 GET accessors) returned 200 with real
model output.

### 🔴 Startup-blocking bugs (app would not boot)
- [x] **`alteration_radom.py` Pydantic schema crash**: `MutateIndependentlyParameters.prob_mat: MutationMatrix` used a bare `numpy.typing.NDArray` alias as a Pydantic v2 field type — `PydanticSchemaGenerationError` at import time, crashing the whole app before it could serve a single request. Changed the field type to `list[list[float]]` (identical JSON wire format; the domain layer only ever indexes/iterates it).

### 🔴 Runtime crashes (app started, but requests failed)
- [x] **`spliceai` package / NumPy 2.x incompatibility**: the third-party `spliceai.utils.one_hot_encode()` calls `np.fromstring(seq, np.int8)` in binary mode, which NumPy has removed (`ValueError: The binary mode of fromstring is removed, use frombuffer instead`). This broke every endpoint that touches the model (`/GetSimpleProb/`, `/GetDeltaScore/`, all alteration endpoints via `_track_alteration`). Added a local, numpy-2-compatible reimplementation in `app/domain/spliceai_calculation.py` (same output, uses `np.frombuffer` instead) and stopped importing the broken upstream function.
- [x] **`sequence_functions.py` `mutate_independently` unbound method call**: called `RandomAlterationFunctions.proba_law(base, prob_mat)` instead of `self.proba_law(base, prob_mat)` — missing `self` meant `base` was passed as `self` and `prob_mat` was missing entirely (`TypeError`). Fixed to a bound call.
- [x] **`sequence_functions.py` `proba_law` case mismatch**: looked up `GlobalVar.BASES.index(base.upper())`, but `GlobalVar.BASES = "acgt"` is lowercase and the lookup always used uppercase — `ValueError: substring not found` on every call, so `/mutateindependently` never worked. Fixed to `GlobalVar.BASES.upper().index(base.upper())`.
- [x] **`genomic_analysis.py` stale method name**: `_zona()` called `gs.result_per_seqences(...)` (old typo) instead of `gs.result_per_sequences(...)` (renamed in an earlier pass, but this call site was missed) — `AttributeError`, breaking `/analysis/patterninzona`. Fixed the call site.
- [x] **`genomic_analysis.py` `_zona()` placeholder sequence**: constructed `IndependentGeneticVariant(..., altered_sequence="_")` with a literal 1-character placeholder, intending it to be "useless" — but `IndependentGeneralServices` applies mutations onto `altered_sequence`, not `sequence`, so `apply_mutations()` tried to index far past the end of a 1-character list (`IndexError: list assignment index out of range`) on every zone-analysis call. Changed the placeholder to `altered_sequence=self.sequence` (a correctly-sized starting point).
- [x] **`mixins.py` `_track_alteration()` length-mismatch crash**: unconditionally called `tuple_mutation(base_seq, altered_seq)`, which only supports a same-length, position-wise diff. Any length-changing structural edit (delete, non-overwriting insert/move/copy-paste, pattern delete) raised `ValueError: genomes must have the same length`, breaking `/altbyindex/delete`, `/altbyindex/move`, and similar. Now skips the (purely informational) splicing-label diff when lengths differ instead of raising.

### 🟡 Test-suite bugs found while verifying the fix (not live-server blockers, but were making `pytest app/test/` unreliable)
- [x] **`test_endpoint_integration.py` Redis monkeypatch leaked across the whole test session**: `redis_session._get_redis_client = lambda: fakeredis.FakeStrictRedis(...)` built a *new* empty fake store on every call (no caching) and was never undone — every `set_session_data`/`get_session_data` pair inside this file's own tests, and in every other test module collected afterward in the same `pytest` run, silently no-opped. Fixed to cache and return a single shared fake client instance.
- [x] **`test_functions.py` is not an automated test**: it's documented as a manual/script-based visualization tool, but its `test_*.py` name made pytest auto-collect and execute its top-level model calls and `matplotlib.use('TkAgg')` at collection time, crashing collection for the entire suite. Added `pytest.ini` with `addopts = --ignore=app/test/test_functions.py` (run it directly via `python app/test/test_functions.py` instead).

### 🟠 Known remaining test debt (not fixed — out of scope for this pass)
- [ ] ~43 tests across `test_alteration_functions.py`, `test_analysis_regression.py`, `test_endpoint_integration.py`, and `test_independent_gv.py` still fail. Root cause for most of them (confirmed via `test_independent_gv.py::test_independent_variant_keeps_mutations_as_flat_list`) is that they predate the `_mutations_target_attr` refactor: `IndependentGeneticVariant.apply_mutations()` now writes to `self.altered_sequence`, but these tests still assert against `self.sequence` and/or construct variants with an empty placeholder `altered_sequence`, triggering the same "index out of range" shape of bug fixed above in `genomic_analysis.py`. None of this affects the live server — verified via `python test_payloads.py`, all 11 POST endpoints + all 6 GET accessors return 200 with real SpliceAI output. Fixing the test suite properly is a separate, larger pass (rewrite fixtures against current `_mutations_target_attr` semantics).

### Verification performed
- `fastapi run app/main.py` boots cleanly (all 5 SpliceAI models load, no startup errors).
- `python test_payloads.py --server http://127.0.0.1:8000` → **11/11 POST endpoints pass**, **6/6 GET accessors pass**, all with real (non-mocked) SpliceAI predictions.
- `python -m pytest app/test/` → collection no longer crashes; `test_redis_session.py` now fully passes (16/16); remaining failures are pre-existing test debt documented above.

### ⚠️ Known caveat (flagged 2026-07-08, not yet root-caused)
- `/analysis/patterninzona` returned HTTP 200 with real output in the smoke test above, but has separately been flagged as not fully operational/reliable in every case. Deprioritized for now per explicit instruction — revisit before relying on this endpoint for anything beyond a smoke test.

---

## Judge Review — Tasks 2–4 (2026-07-09)

- [x] Compact Redis storage / `reconstruct_altered_sequence()` (Task 1) — previously reviewed and closed.
- [x] **`GET /get/allsimpleprobas` (Task 2) — `[DONE]`** (re-attempt after an initial `[FAILED]`): the per-entry `"altered sequence"` field was silently wrong for bounded deletes and non-default-length insert/move/copy-paste (confirmed via live reproduction — see `docs/ai/audits_history.md`). **Fixed (2026-07-09):** `_track_alteration()` now stores `altered_sequence` directly per entry; `_apply_single_alteration()` uses it preferentially, falling back to label-based reconstruction only for pre-fix entries. `test_mixins.py` extended from 13→18 tests. Judge independently re-ran all original bug repros (plus `copy_paste`) against the live backend — all now match ground truth — and confirmed 18/18 `test_mixins.py` passes and zero regressions in the full suite (identical pre-existing failure set).
- [x] **Surface `/get/allsimpleprobas` in all three frontend proposals (Task 3) — `[DONE]`**: `api.get.allSimpleProbas()` (`client.js`), `workspace.fetchAllSimpleProbas()`; Pipeline `tracked_alterations_simple` block + `ProbaHistoryOutput`; Workbench `HistoryLog.js`'s `TrackedProbabilities` subsection; Compare's Data Source toggle (`delta` vs `proba`) with mode-aware `RankingTable`/`ManhattanChart`/`DetailChart`/`ExportBar`. Reviewed and confirmed correct — does not consume the buggy `"altered sequence"` field (Task 2's bug above), only `acceptor_proba`/`donor_proba` (cached, correct).
- [x] **Pipeline layout/UX fixes (Task 4) — `[DONE]`**: full-container drop-zone coverage, recipe-block input fields narrowed to ~1/3 width via a new `field__control` class, sequence input relocated above the Output column (session metadata preserved), collapsible recipe blocks via a per-block chevron toggle. Scoped entirely to `frontend/src/views/pipeline/` as specified.

**Sandbox caveat (Tasks 3 & 4):** no `node`/browser/browser-automation tool available, and the project has no frontend build/test step. Verification was static (byte-diff of served files, brace/paren balance, manual trace of `htm` template logic against real backend response shapes) rather than an actual DOM/interaction check — see `audits_history.md` for detail. A human should open all three proposals once before the next release.

---

