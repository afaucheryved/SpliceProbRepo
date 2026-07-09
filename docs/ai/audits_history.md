## Code Review & Audit (2026-07-07)

### Critical Bugs Found & Fixed
1. **`alteration_byindex_router.py`**: `end`/`length` conditions swapped — `end=None` passed as `end`, `length=p.end` (wrong variable). Fixed routing logic.
2. **`test_endpoint_integration.py`**: Redis monkeypatch referenced non-existent `_get_client` → fixed to `_get_redis_client`.
3. **`test_endpoint_integration.py`**: `_FakeModel` stub missing `_one_hot_encoder` method — any alteration test would crash. Added stub.
4. **`main.py`**: `alteration_radom` router never registered — `/mutateindependently` endpoint was unreachable. Added router inclusion.
5. **`test_alteration_functions.py`**: `delete_end_to_end` missing `test_` prefix — pytest would not discover it. Renamed.
6. **`sequence_functions.py`**: `mutate_independently` did not call `_track_alteration` — inconsistent with all other alteration methods. Added tracking.
7. **`general_services.py`**: `return_proba_delta` iterated `len(self.sequence)` but indexed `self.altered_sequence[i]` — IndexError after deletions. Fixed to `len(self.altered_sequence)`.

### Audit Verdict
- **Redis session isolation**: ✅ Correctly implemented via `session:{uuid}:{key}` namespacing. Tests confirm no cross-session leakage.
- **Test coverage**: Adequate for unit tests (alteration functions, Redis session). Integration tests are smoke-level only — they verify endpoints don't crash but don't deeply validate business logic. Acceptable for current stage.
- **Technical debt**: The mega-class inheritance pattern (`InternalGeneticVariant` with 9 parents) remains the primary architectural concern. The `initialize_internal_gv.py` stub is now vestigial (all routers use the factory) but kept for backward compatibility.

## Judge Review — Tasks 2–4 (2026-07-09)

### Critical Bug Found — NOT Fixed (routed back to `[WORKER]`)

**`app/domain/mixins.py::_apply_single_alteration()` reconstructs the wrong sequence whenever an alteration used a non-default length/end parameter.** Introduced by Task 1 (this helper backs `reconstruct_altered_sequence()`/`reconstruct_altered_sequence_history()`), but was dead code at the time Task 1 was reviewed ("no call sites outside the mixin" — see Task 1's own implementation note in `active_context.md`). Task 2 wired it into a live, public endpoint (`GET /get/allsimpleprobas`), which is what made the bug reachable and is why **Task 2 is marked `[FAILED]`**.

**Root cause:** several `_track_alteration()` human-readable labels are lossy — they don't encode every parameter the original call used, only the "default" case:
- `delete:{start}` (from `delete_by_index()`, `app/domain/sequence_functions.py:95`) never encodes `end`/`length`. `_apply_single_alteration()` assumes `delete:{start}` always means "delete from `start` to end of sequence" — wrong whenever the original call passed a bounded `end`/`length` (a fully supported, documented case — `delete_by_index()`'s own docstring diagram shows a bounded middle-range delete as the primary example).
- `insert:{pattern}@{index}` never encodes `length`. `_apply_single_alteration()` always assumes `replace_length == len(pattern)` (the `length="default"` case) — wrong whenever the original call passed `length="all"` or an explicit int.
- `move:{start}-{end}->@{index}` never encodes `length_paste` — same class of bug.
- `copy_paste:{start}-{end}@{index}` never encodes `length_paste` — same class of bug (not empirically reproduced below, but identical code shape to `move:`, so treat as equally broken).

**Confirmed via live reproduction** (real backend, `TestClient`, comparing `GET /get/alteredsequence` [ground truth] against the reconstructed `"altered sequence"` field in `GET /get/allsimpleprobas`), all on an 80bp sequence (`a`×20 + `c`×20 + `g`×20 + `t`×20):
1. **Bounded delete**: `delete_by_index(start=21, end=40)` → ground truth 60bp (`a`×20+`g`×20+`t`×20). Reconstructed: 20bp (`a`×20 only) — the entire tail after the deleted range was silently dropped.
2. **Non-default-length insert**: `insert(pattern="XXXX", index=10, length=30)` → ground truth 54bp. Reconstructed: 80bp with stray leftover bases the real operation had overwritten/removed.
3. **Non-default-length move**: `move(start_cc=1, end_cc=20, index_paste=40, length_paste=10)` → ground truth 70bp. Reconstructed: 120bp, badly malformed (looked like duplicated content).

**Why the existing test suite didn't catch this:** all delete/insert/move cases in `app/test/test_mixins.py` (added by Task 1, 13/13 passing) only exercise the *default* parameterization (delete-to-end, `length="default"` insert/move) — never a bounded `end`/`length`/`length_paste`. The tests pass; the bug is real and only shows up off the tested happy path.

**Current blast radius — contained, not zero:** none of the three frontend proposals (Task 3: Pipeline's `ProbaHistoryOutput`, Workbench's `TrackedProbabilities`, Compare's `loadTrackedAlterations`) read the `"altered sequence"` field from `/get/allsimpleprobas` — they only consume `acceptor_proba`/`donor_proba`, which come straight from the per-entry cached `proba_simple` and are **not** affected by this bug (computed once, at alteration time, against the real sequence). So Task 3's actual UI behavior is correct today. But the endpoint's advertised contract (`"altered sequence"` shaped like `/get/simpleproba`'s response) is silently wrong for a normal, common case — a landmine for `/docs`/Swagger consumers, a future frontend feature, or any external API consumer.

**Fix instructions for the next `[WORKER]` session (Task 2, re-attempt):** the label format itself needs to change — no amount of smarter parsing recovers information the label never captured. Two options, either acceptable:
  (a) Enrich the human labels in `sequence_functions.py` to include the missing parameters (e.g. `delete:{start}-{end}`, `insert:{pattern}@{index}:{length}`, `move:{start}-{end}->@{index}:{length_paste}`) and update `_apply_single_alteration()` to parse them — but this changes the label format other code may already rely on (check `mutation.human` consumers, e.g. `positionFromTrackedLabel()` in `frontend/src/views/comparative/ComparativeView.js`, before doing this).
  (b) Simpler and more robust: have `_track_alteration()` store the real `self.altered_sequence` string directly per entry (not reconstructed) — strings are cheap compared to the one-hot arrays Task 1 removed (that was the actual memory blowup: ~20,000+ positions × 4 floats per call), so this doesn't reintroduce Task 1's original problem. This also eliminates the entire class of "label doesn't capture every parameter" bugs, present and future.
  Whichever fix is chosen, extend `test_mixins.py` with bounded-delete / non-default-length insert+move+copy_paste cases (the gap that let this slip through) before marking the task done again.

### Verdict
- **Task 1** — Not reopened (already `[DONE]`, and its own stated scope — remove `one_hot` persistence, add the reconstruction helper, 13/13 tests green — was genuinely met at the time; the helper was inert until Task 2 wired it up). Bug is logged here for the record since the faulty code lives in Task 1's file.
- **Task 2 — `[FAILED]`**: see bug above. Root cause confirmed via live reproduction, not fixed in this session (Judge does not implement fixes — routed back to `[WORKER]`).

#### Re-verification (2026-07-09) — `[DONE]`

`[WORKER]` re-attempted using fix option (b) from above: `_track_alteration()` (`app/domain/mixins.py`) now stores `self.altered_sequence` directly as `entry["altered_sequence"]` at alteration time — the real, correct value, immune to lossy human labels. `_apply_single_alteration()` returns this stored string immediately when present, and only falls back to label-based parsing for entries that predate the fix (backward compatibility, tested).

**Independently re-verified, not just trusted from the Worker's report:**
- Re-ran all three original live reproductions (bounded delete, non-default-length insert, non-default-length move) against the fixed code via a fresh `TestClient` session, comparing the endpoint's `"altered sequence"` field against `GET /get/alteredsequence`'s ground truth — **all three now match exactly** (60/60bp, 54/54bp, 70/70bp).
- Additionally tested `copy_paste` with non-default `length_paste` (same bug class, not in the original three repros) — also matches ground truth (90/90bp).
- `pytest app/test/test_mixins.py` → **18/18 pass**, confirmed directly (not taken from the Worker's note).
- Full suite `pytest app/test/` → 43 failed / 38 passed. Diffed the failing-test list against a `git stash`-baseline run of the same suite — **byte-for-byte identical failure set** (the 5 additional passes are exactly the 5 new tests; the 43 pre-existing failures are unchanged). No regressions.

The new tests in `test_mixins.py` covering the reconstruction cases (`test_bounded_delete_reconstruction` etc.) construct their fixture entries with `altered_sequence` already set to the expected value, so they mostly verify `_apply_single_alteration()` returns the stored value verbatim (close to tautological in isolation) — the meaningful coverage is `test_backward_compatibility_missing_altered_sequence` (exercises the fallback path) and the assertion in `TestTrackAlterationNoOneHot` that `_track_alteration()` itself populates `entry["altered_sequence"]` correctly end-to-end. This is why the live-repro re-verification above (driving the real `_track_alteration()` call path through actual endpoints, not constructed fixtures) was the deciding check, not the unit tests alone.

**Task 2 is now `[DONE]`.**
- **Task 3 — `[DONE]`**: reviewed `client.js`, `workspace.js`, all three proposals' new UI paths (Pipeline `tracked_alterations_simple` block, Workbench `TrackedProbabilities`, Compare `loadTrackedAlterations` + mode-aware `RankingTable`/`ManhattanChart`/`DetailChart`/`ExportBar`, `SegmentedControl`'s new `ariaLabel` prop). No stale `deltaData` references left after the `deltaData`→`resultData` rename (checked via repo-wide grep). Does not consume the buggy `"altered sequence"` field, so unaffected by Task 2's bug.
- **Task 4 — `[DONE]`**: reviewed `PipelineView.js`/`RecipeBlock.js`/`BlockForm.js`/`pipeline.css`. Drop-zone container fallback correctly guarded (`e.target === e.currentTarget`) against double-handling drops that bubble from child rows/tail strip. Width-reduction scoped via a new `field__control` class (doesn't clobber the matrix/mutation-list fields' dedicated widths). Layout restructure correctly nests `SessionBar` + Output panel in a shared flex column so the session bar now matches the output column's width; session ID badge / "Start new session" button relocated, not removed. Collapse state is local per-`RecipeBlock` (correct choice — pure UI state, no reason to live in the `recipe` array).
- **Sandbox caveat (applies to Task 3 and Task 4):** this environment has no `node`, browser, or browser-automation tool, and the project has no frontend build/test step to run instead. Verification for both tasks was static (brace/paren balance, served-file-byte-diff, manual trace of Preact/`htm` semantics against the actual backend response shapes) rather than a real DOM/interaction check. Recommend a human open all three proposals once before the next release to confirm layout, collapse toggle, drag-and-drop, and the new Compare data-source toggle behave as intended.