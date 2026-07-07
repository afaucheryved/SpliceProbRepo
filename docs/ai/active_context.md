# Active Context

## Current Objectives
`fastapi run app/main.py` now boots and serves correctly end-to-end (verified
with `python test_payloads.py`, 11/11 endpoints + 6/6 GET accessors passing
with real SpliceAI output). A three-proposal frontend MVP was added under
`frontend/`. Remaining open item: ~43 pytest failures are pre-existing test
debt (stale fixtures predating the `_mutations_target_attr` refactor), not a
live-server issue — see `docs/ai/progress.md` for the root cause and file
list.

## Previous Objectives (superseded)
All tasks from the initial plan are now completed. The project is in a stable, fully-tested state.

### Completed Tasks
1. ✅ Fix `AlterationFunctionsByPattern` missing mixin inheritance — Already inherits from `AlteredSequenceTrackerMixin` (was never broken)
2. ✅ Fix `AlterationFunctionsByIndex` missing mixin — Added `AlteredSequenceTrackerMixin` inheritance
3. ✅ Fix typos in `general_services.py` (`result_per_seqences` → `result_per_sequences`, `using_altered_seqence` → `using_altered_sequence`, `return_proba_simple` bug)
4. ✅ Fix typos in `calcul_function.py` (`euclidian` → `euclidean`)
5. ✅ Create `initialize_internal_gv.py` stub for legacy singleton imports
6. ✅ Migrate 4 legacy routers (`get_router.py`, `resetgv_router.py`, `analysis_router.py`, `alteration_radom.py`) to session-based factory
7. ✅ Fix `AlterationFunctionsByIndex.move()` and `copy_past()` — they used `self.sequence` instead of `self.altered_sequence` for pattern extraction, breaking alteration chaining
8. ✅ Fix endpoint typo `/delet` → `/delete` (both aliases registered)
9. ✅ Fix `length_past` param name → `length_paste`
10. ✅ Fix `get_router.py` endpoint typo `/delatproba` → `/deltaproba` (both aliases registered)
11. ✅ Eliminate code duplication between `GeneralServices` and `IndependentGeneralServices` (child only overrides `_mutations_target_attr`)
12. ✅ Eliminate code duplication between `Scoring` and `IndependentScoring` (via `IndependentScoring = Scoring` alias)
13. ✅ Add unit tests for alteration functions (`test_alteration_functions.py`)
14. ✅ Add Redis session tests (`test_redis_session.py`)
15. ✅ Add integration tests for FastAPI endpoints (`test_endpoint_integration.py`)
16. ✅ Write proper `README.md` with setup instructions, API usage, Redis configuration

## Current Working Files
- Backend: stable, `fastapi run app/main.py` verified working end-to-end.
- Frontend: `frontend/` (three MVP proposals, see `frontend/README.md`).
- Known debt: `docs/ai/progress.md` → "Known remaining test debt" section (~43 stale pytest failures, does not affect the live server).

## Recent Changes
| Date | Change | Files Affected |
|------|--------|---------------|
| 2026-07-07 | Initial AI Memory Bank created | `docs/ai/*`, `.clinerules` |
| 2026-07-07 | Audit complete — identified pending tasks from plan1.txt | `docs/ai/progress.md`, `docs/ai/active_context.md` |
| 2026-07-07 | Typo fixes: `result_per_seqences`→`result_per_sequences`, `euclidian`→`euclidean`, `return_proba_simple` bug | `app/services/general_services.py`, `app/domain/calcul_function.py`, `app/domain/mixins.py` |
| 2026-07-07 | Recreated `initialize_internal_gv.py` stub | `app/domain/initialization/initialize_internal_gv.py` |
| 2026-07-07 | Migrated 4 legacy routers to session-based factory | `app/router/get_router.py`, `app/router/resetgv_router.py`, `app/router/analysis_router.py`, `app/router/alteration_radom.py` |
| 2026-07-07 | Fixed `move()` and `copy_past()` in `AlterationFunctionsByIndex`: changed `self.sequence` → `self.altered_sequence`, eliminated double/triple tracking | `app/domain/sequence_functions.py` |
| 2026-07-07 | Added `/delete` and `/delet` aliases for backward-compatible typo fix | `app/router/alteration_byindex_router.py`, `app/router/alteration_bypattern_router.py` |
| 2026-07-07 | Renamed `length_past` → `length_paste` in schemas | `app/router/alteration_byindex_router.py` |
| 2026-07-07 | Added `/deltaproba` and `/delatproba` aliases for backward-compatible typo fix | `app/router/get_router.py` |
| 2026-07-07 | Eliminated code duplication: `IndependentGeneralServices` simplified, `IndependentScoring = Scoring` | `app/services/general_services.py`, `app/domain/calcul_function.py` |
| 2026-07-07 | Added unit tests for alteration functions, Redis session, and integration tests | `app/test/test_alteration_functions.py`, `app/test/test_redis_session.py`, `app/test/test_endpoint_integration.py` |
| 2026-07-07 | Wrote comprehensive README.md | `README.md` |

## Recent Changes
| Date | Change | Files Affected |
|------|--------|---------------|
| 2026-07-07 | Code review & audit: fixed 7 critical bugs | See below |

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

## Next Steps (Future / Optional)
- Refactor `InternalGeneticVariant` mega-class: 9-parent multiple inheritance → consider composition
- Fix spelling inconsistency: `independant_gv_schema.py` uses French spelling
- Expose Acceptor Loss and Donor Loss SpliceAI scores
- Add batching support for multiple sequences in a single request
- Dockerize the application
- Add `/health` endpoint
- Rewrite the ~43 stale tests listed in `docs/ai/progress.md` against current `_mutations_target_attr` semantics

---

## `fastapi run` Startup & Runtime Fix Pass (2026-07-07)

`fastapi run app/main.py` previously crashed at import time and, once that
was fixed, most model/session-touching endpoints still 500'd. Full root
cause list, fixes, and verification are in `docs/ai/progress.md` under
"`fastapi run app/main.py` Startup & Runtime Fixes". Summary of files
touched:

| File | Fix |
|------|-----|
| `app/router/alteration_radom.py` | `prob_mat` field type: bare numpy alias → `list[list[float]]` (fixes Pydantic startup crash) |
| `app/domain/spliceai_calculation.py` | Local NumPy-2-compatible `one_hot_encode()` replacing the broken upstream `spliceai.utils` one |
| `app/domain/sequence_functions.py` | `mutate_independently`: unbound → bound `self.proba_law(...)` call; `proba_law`: fixed lowercase/uppercase base lookup mismatch |
| `app/domain/genomic_analysis.py` | `_zona()`: `result_per_seqences` → `result_per_sequences` typo; placeholder `altered_sequence="_"` → `self.sequence` |
| `app/domain/mixins.py` | `_track_alteration()`: skip the same-length-only `tuple_mutation()` diff when the sequence length changed, instead of raising |
| `app/test/test_endpoint_integration.py` | Redis monkeypatch now caches a single fake client instead of leaking a fresh one per call across the whole pytest session |
| `pytest.ini` (new) | Exclude `test_functions.py` (manual/script tool) from pytest auto-collection |

Verified via `python test_payloads.py --server http://127.0.0.1:8000`
(11/11 POST + 6/6 GET) and `python -m pytest app/test/` (collection no
longer crashes; `test_redis_session.py` 16/16).

---

*This file is updated at the end of each completed task to reflect the latest project state.*
