# Progress

## Core API Endpoints
- [x] **`POST /GetSimpleProb/`** — Returns baseline acceptor and donor splicing probabilities for a DNA sequence with optional point mutations.
- [x] **`POST /GetDeltaScore/`** — Returns the delta (difference) in splicing scores between original and mutated sequences.
- [x] **`POST /resetgv`** — Resets the internal genetic variant with new sequence/mutations (singleton pattern).
- [x] **`GET /get/sequence|gv|simpleproba|deltaproba|mutations|alteredsequence`** — Read accessors for the singleton variant's state.

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
- [x] `AlteredSequenceTrackerMixin` for persisting alteration history (one-hot, proba, mutation labels).

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

### Potential Features
- [ ] Expose Acceptor Loss and Donor Loss SpliceAI scores.
- [ ] Add batching support for multiple sequences in a single request.
- [ ] Add a web frontend.
- [ ] Dockerize the application.
- [ ] Add `/health` endpoint.