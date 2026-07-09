# Progress

## Core API Endpoints
- [x] **`POST /GetSimpleProb/`** — Returns baseline acceptor and donor splicing probabilities for a DNA sequence with optional point mutations.
- [x] **`POST /GetDeltaScore/`** — Returns the delta (difference) in splicing scores between original and mutated sequences.
- [x] **`POST /resetgv`** — Starts/resets a session-bound internal genetic variant with a new sequence/mutations (session-based, not singleton — see `docs/ai/architecture.md` → "Session Management").
- [x] **`GET /get/sequence|gv|simpleproba|deltaproba|mutations|alteredsequence`** — Read accessors for a session's variant state (`session_id` query param).
- [ ] **`GET /get/allsimpleprobas`** — Baseline probability per tracked altered-sequence version, keyed by `"{step index}: {mutation.human}"`. **Known bug (2026-07-09, see `docs/ai/audits_history.md`): the per-entry `"altered sequence"` field is silently wrong for bounded deletes and non-default-length insert/move/copy-paste** — `acceptor_proba`/`donor_proba` are correct (cached, unaffected). Not yet fixed — next `[WORKER]` session should re-attempt per the audit's fix instructions.

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
- [x] Redis-backed session storage with 30-minute TTL (configurable via `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB` env vars).
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
- [ ] **`GET /get/allsimpleprobas` (Task 2) — `[FAILED]`**: endpoint works and returns 200, but its per-entry `"altered sequence"` field is silently wrong for bounded deletes and non-default-length insert/move/copy-paste (confirmed via live reproduction). Root cause and fix instructions logged in `docs/ai/audits_history.md` → "Judge Review — Tasks 2–4". Routed back to `[WORKER]`.
- [x] **Surface `/get/allsimpleprobas` in all three frontend proposals (Task 3) — `[DONE]`**: `api.get.allSimpleProbas()` (`client.js`), `workspace.fetchAllSimpleProbas()`; Pipeline `tracked_alterations_simple` block + `ProbaHistoryOutput`; Workbench `HistoryLog.js`'s `TrackedProbabilities` subsection; Compare's Data Source toggle (`delta` vs `proba`) with mode-aware `RankingTable`/`ManhattanChart`/`DetailChart`/`ExportBar`. Reviewed and confirmed correct — does not consume the buggy `"altered sequence"` field (Task 2's bug above), only `acceptor_proba`/`donor_proba` (cached, correct).
- [x] **Pipeline layout/UX fixes (Task 4) — `[DONE]`**: full-container drop-zone coverage, recipe-block input fields narrowed to ~1/3 width via a new `field__control` class, sequence input relocated above the Output column (session metadata preserved), collapsible recipe blocks via a per-block chevron toggle. Scoped entirely to `frontend/src/views/pipeline/` as specified.

**Sandbox caveat (Tasks 3 & 4):** no `node`/browser/browser-automation tool available, and the project has no frontend build/test step. Verification was static (byte-diff of served files, brace/paren balance, manual trace of `htm` template logic against real backend response shapes) rather than an actual DOM/interaction check — see `audits_history.md` for detail. A human should open all three proposals once before the next release.